from datetime import date

from sqlalchemy import select

from app.db import SessionLocal
from app.domain import build_safe_unknown_records, candidate_student_ids
from app.models import (AttendanceRecord, AttendanceSession, AttendanceSessionClass,
                        AttendanceStatus, CourseClass, Enrolment, Faculty, FacultyClassAssignment,
                        PanoramaDraft, SessionStatus, Student, TwinReview)
from tests.conftest import auth
import numpy as np
from app.recognition import decide_match
from app.worker import _enrolment_pose_quality, resolve_student_status, select_enrolment_face
from app.routes_admin import class_json, student_json
from types import SimpleNamespace
from PIL import Image
import io
import os
import tempfile
from app.storage import ObjectStorage, decode_image_pixels, validate_image


def test_successful_no_match_is_absent_but_missing_inputs_stay_unknown():
    absent=resolve_student_status("S001",3,{},set(),set(),1)
    assert absent==(AttendanceStatus.ABSENT,None,"NO_MATCH_OBSERVED")
    beta_present=resolve_student_status("S001",1,{"S001":(0.61,None)},set(),set(),1)
    assert beta_present==(AttendanceStatus.PRESENT,0.61,None)
    no_gallery=resolve_student_status("S001",0,{},set(),set(),1)
    assert no_gallery==(AttendanceStatus.UNKNOWN,None,"INSUFFICIENT_ACTIVE_FACE_ENROLMENT")
    no_image=resolve_student_status("S001",3,{},set(),set(),0)
    assert no_image==(AttendanceStatus.UNKNOWN,None,"NO_USABLE_SESSION_IMAGE")


def test_enrolment_pose_requires_two_level_eye_landmarks():
    frontal=SimpleNamespace(box=(0,0,200,300),landmarks=np.array([[145,100],[55,102],[0,0],[0,0],[0,0]],dtype=np.float32))
    profile=SimpleNamespace(box=(0,0,200,300),landmarks=np.zeros((5,2),dtype=np.float32))
    tilted=SimpleNamespace(box=(0,0,200,300),landmarks=np.array([[140,60],[60,150],[0,0],[0,0],[0,0]],dtype=np.float32))
    assert _enrolment_pose_quality(frontal)[0] is True
    assert _enrolment_pose_quality(profile)[0] is False
    assert _enrolment_pose_quality(tilted)[0] is False


def _face(box):
    return SimpleNamespace(box=box)


def test_enrolment_face_selection_merges_overlapping_detector_boxes():
    primary = _face((100, 100, 740, 1046))
    overlapping = _face((485, 353, 958, 904))
    selected, count, ratio = select_enrolment_face([primary, overlapping])
    assert selected is primary
    assert count == 1
    assert ratio == 0.0


def test_enrolment_face_selection_ignores_tiny_secondary_portrait():
    primary = _face((100, 100, 900, 1000))
    id_card_portrait = _face((1000, 1500, 1100, 1620))
    selected, count, ratio = select_enrolment_face([primary, id_card_portrait])
    assert selected is primary
    assert count == 2
    assert ratio < 0.10


def test_enrolment_face_selection_rejects_two_people():
    first = _face((100, 100, 700, 900))
    second = _face((800, 100, 1350, 850))
    selected, count, ratio = select_enrolment_face([first, second])
    assert selected is None
    assert count == 2
    assert ratio > 0.10


def setup_class_scope(identities):
    with SessionLocal.begin() as db:
        assigned = CourseClass(code="CSE-5A", subject="Vision", department="CSE", semester=5, section="A", academic_session="2026-27")
        unrelated = CourseClass(code="CSE-3A", subject="Networks", department="CSE", semester=3, section="A", academic_session="2026-27")
        selected_student = Student(student_id="S001", roll_number="R001", name="Selected", department="CSE", semester=5, section="A")
        excluded_student = Student(student_id="S002", roll_number="R002", name="Excluded", department="CSE", semester=3, section="A")
        db.add_all([assigned, unrelated, selected_student, excluded_student]); db.flush()
        db.add_all([
            FacultyClassAssignment(faculty_id=identities["faculty_id"], class_id=assigned.id),
            FacultyClassAssignment(faculty_id=identities["other_id"], class_id=unrelated.id),
            Enrolment(student_id=selected_student.id, class_id=assigned.id),
            Enrolment(student_id=excluded_student.id, class_id=unrelated.id),
        ])
        return assigned.id, unrelated.id, selected_student.id, excluded_student.id


def test_login_and_rotating_refresh(client, identities):
    login = client.post("/api/v1/auth/login", json={"email":"admin@example.edu","password":"StrongPass123!"})
    assert login.status_code == 200
    first = login.json()["refresh_token"]
    rotated = client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != first
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": first}).status_code == 401


def test_logout_revokes_refresh_token(client, identities):
    login=client.post("/api/v1/auth/login",json={"identifier":"admin@example.edu","password":"StrongPass123!"})
    refresh=login.json()["refresh_token"]
    assert client.post("/api/v1/auth/logout",json={"refreshToken":refresh}).status_code==204
    assert client.post("/api/v1/auth/refresh",json={"refreshToken":refresh}).status_code==401


def test_faculty_cannot_select_unassigned_class(client, identities):
    assigned, unrelated, _, _ = setup_class_scope(identities)
    good = client.post("/api/v1/attendance/sessions", json={"class_ids":[assigned]}, headers=auth(identities["faculty_token"]))
    assert good.status_code == 201
    denied = client.post("/api/v1/attendance/sessions", json={"class_ids":[unrelated]}, headers=auth(identities["faculty_token"]))
    assert denied.status_code == 403


def test_candidate_pool_never_includes_unselected_class(identities):
    assigned, _, selected, excluded = setup_class_scope(identities)
    with SessionLocal.begin() as db:
        session = AttendanceSession(faculty_id=identities["faculty_id"], attendance_date=date.today())
        db.add(session); db.flush(); db.add(AttendanceSessionClass(session_id=session.id, class_id=assigned)); db.flush()
        candidates = candidate_student_ids(db, session.id)
        assert selected in candidates
        assert excluded not in candidates


def test_multi_class_statistics_do_not_mix_students_between_classes(identities):
    with SessionLocal.begin() as db:
        first=CourseClass(code="ISO-A",subject="First",department="CSE",semester=1,section="A",academic_session="2026-27")
        second=CourseClass(code="ISO-B",subject="Second",department="CSE",semester=1,section="B",academic_session="2026-27")
        present=Student(student_id="ISO-S1",roll_number="ISO-R1",name="Present",department="CSE",semester=1,section="A")
        absent=Student(student_id="ISO-S2",roll_number="ISO-R2",name="Absent",department="CSE",semester=1,section="B")
        db.add_all([first,second,present,absent]);db.flush()
        db.add_all([Enrolment(student_id=present.id,class_id=first.id),Enrolment(student_id=absent.id,class_id=second.id)])
        session=AttendanceSession(faculty_id=identities["faculty_id"],attendance_date=date.today(),status=SessionStatus.FINALIZED)
        db.add(session);db.flush()
        db.add_all([AttendanceSessionClass(session_id=session.id,class_id=first.id),AttendanceSessionClass(session_id=session.id,class_id=second.id)])
        db.add_all([
            AttendanceRecord(session_id=session.id,student_id=present.id,ai_status=AttendanceStatus.PRESENT,status=AttendanceStatus.PRESENT,model_version="test"),
            AttendanceRecord(session_id=session.id,student_id=absent.id,ai_status=AttendanceStatus.ABSENT,status=AttendanceStatus.ABSENT,model_version="test"),
        ])
        db.flush()
        assert class_json(db,first)["attendance_percentage"]==100
        assert class_json(db,second)["attendance_percentage"]==0
        assert student_json(db,present)["overallAttendance"]==100


def test_model_unavailable_replaces_prior_ai_result_idempotently(identities):
    assigned,_,selected,_=setup_class_scope(identities)
    with SessionLocal.begin() as db:
        session=AttendanceSession(faculty_id=identities["faculty_id"],attendance_date=date.today(),status=SessionStatus.PROCESSING)
        db.add(session);db.flush();db.add(AttendanceSessionClass(session_id=session.id,class_id=assigned));db.flush()
        db.add(AttendanceRecord(session_id=session.id,student_id=selected,ai_status=AttendanceStatus.PRESENT,status=AttendanceStatus.PRESENT,score=.9,model_version="old"));db.flush()
        build_safe_unknown_records(db, session)
        build_safe_unknown_records(db, session)
        records = list(db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)))
        assert len(records) == 1
        assert records[0].student_id == selected
        assert records[0].ai_status == AttendanceStatus.UNKNOWN
        assert records[0].status == AttendanceStatus.UNKNOWN
        assert records[0].review_reason == "MODEL_UNAVAILABLE"


def test_finalize_requires_acknowledgement_and_amendment_reason(client, identities):
    assigned, _, selected, _ = setup_class_scope(identities)
    with SessionLocal.begin() as db:
        session=AttendanceSession(faculty_id=identities["faculty_id"],attendance_date=date.today(),status=SessionStatus.PENDING_REVIEW)
        db.add(session);db.flush();db.add(AttendanceSessionClass(session_id=session.id,class_id=assigned))
        record=AttendanceRecord(session_id=session.id,student_id=selected,ai_status=AttendanceStatus.UNKNOWN,status=AttendanceStatus.UNKNOWN,review_reason="NO_MATCH",model_version="test")
        db.add(record);db.flush();sid=session.id;rid=record.id
    headers=auth(identities["faculty_token"])
    assert client.post(f"/api/v1/attendance/sessions/{sid}/finalize",json={"acknowledge_unresolved":False},headers=headers).status_code==409
    assert client.post(f"/api/v1/attendance/sessions/{sid}/finalize",json={"acknowledge_unresolved":True},headers=headers).status_code==200
    assert client.patch(f"/api/v1/attendance/records/{rid}",json={"status":"PRESENT","version":1},headers=headers).status_code==422
    changed=client.patch(f"/api/v1/attendance/records/{rid}",json={"status":"PRESENT","reason":"Verified in class","version":1},headers=headers)
    assert changed.status_code==200
    assert changed.json()["ai_status"]=="UNKNOWN"
    assert changed.json()["status"]=="PRESENT"


def test_optimistic_concurrency(client, identities):
    response=client.post("/api/v1/students",json={"student_id":"S1","roll_number":"R1","name":"A Student","department":"CSE","semester":1,"section":"A"},headers=auth(identities["admin_token"]))
    assert response.status_code==201
    duplicate=client.post("/api/v1/students",json={"student_id":"S1","roll_number":"R1","name":"Duplicate Student","department":"CSE","semester":1,"section":"A"},headers=auth(identities["admin_token"]))
    assert duplicate.status_code==409
    assert duplicate.json()["detail"]=="That student ID or roll number already belongs to another student."
    sid=response.json()["id"]
    first=client.patch(f"/api/v1/students/{sid}",json={"name":"Updated","version":1},headers=auth(identities["admin_token"]))
    assert first.status_code==200
    stale=client.patch(f"/api/v1/students/{sid}",json={"name":"Stale","version":1},headers=auth(identities["admin_token"]))
    assert stale.status_code==409


def test_student_and_class_departments_must_come_from_settings(client, identities):
    headers=auth(identities["admin_token"])
    student=client.post("/api/v1/students",json={"student_id":"BAD-DEPT","roll_number":"BAD-DEPT","name":"Invalid Department","department":"Computer Scince","semester":1,"section":"A"},headers=headers)
    assert student.status_code==422
    assert student.json()["title"]=="Invalid department"

    course=client.post("/api/v1/classes",json={"code":"BAD","subject":"Invalid Department","department":"Computer Scince","semester":1,"section":"A","academic_session":"2026-27"},headers=headers)
    assert course.status_code==422
    assert course.json()["title"]=="Invalid department"


def test_class_types_come_from_settings_and_changes_are_audited(client, identities):
    headers = auth(identities["admin_token"])
    current = client.get("/api/v1/settings", headers=headers)
    assert current.status_code == 200
    changed = client.patch(
        "/api/v1/settings",
        headers=headers,
        json={
            "class_types": ["Seminar"],
            "academic_session": "2027-28",
            "semester_count": 6,
            "version": current.json()["version"],
        },
    )
    assert changed.status_code == 200
    assert changed.json()["class_types"] == ["Seminar"]
    assert changed.json()["academic_session"] == "2027-28"
    assert changed.json()["semester_count"] == 6

    rejected = client.post(
        "/api/v1/classes",
        headers=headers,
        json={"code":"TYPE-1","variant":"Lecture","subject":"Test","department":"CSE","semester":1,"section":"A","academic_session":"2026-27"},
    )
    assert rejected.status_code == 422
    accepted = client.post(
        "/api/v1/classes",
        headers=headers,
        json={"code":"TYPE-1","variant":"Seminar","subject":"Test","department":"CSE","semester":1,"section":"A","academic_session":"2026-27"},
    )
    assert accepted.status_code == 201

    audit_rows = client.get("/api/v1/audit?action=SETTING_CHANGED", headers=headers).json()
    assert audit_rows["total"] == 1
    assert audit_rows["items"][0]["before"]["class_types"] == ["Lecture", "Lab", "Tutorial"]
    assert audit_rows["items"][0]["after"]["class_types"] == ["Seminar"]


def test_faculty_email_requires_institution_domain_and_can_be_corrected(client, identities):
    headers=auth(identities["admin_token"])
    invalid=client.post("/api/v1/faculty",json={"email":"typo@christuniverisity.in","password":"StrongPass123!","employee_id":"FAC-TYPO","name":"Typo Faculty","department":"CSE","designation":"Faculty"},headers=headers)
    assert invalid.status_code==422

    with SessionLocal() as db:
        faculty=db.get(Faculty,identities["faculty_id"])
        version=faculty.version
    updated=client.patch(f"/api/v1/faculty/{identities['faculty_id']}",json={"email":"faculty@christuniversity.in","version":version},headers=headers)
    assert updated.status_code==200
    assert updated.json()["email"]=="faculty@christuniversity.in"
    login=client.post("/api/v1/auth/login",json={"identifier":"faculty@christuniversity.in","password":"StrongPass123!"})
    assert login.status_code==200


def test_timetable_crud_filters_and_faculty_scope(client, identities):
    assigned, _, _, _ = setup_class_scope(identities)
    headers = auth(identities["admin_token"])

    class_slot = client.post(
        "/api/v1/admin/timetable/slots",
        json={
            "faculty_id": identities["faculty_id"],
            "class_id": assigned,
            "slot_type": "CLASS",
            "day_of_week": 1,
            "start_time": "09:00",
            "end_time": "10:00",
            "room": "Room 101",
        },
        headers=headers,
    )
    assert class_slot.status_code == 201

    free_slot = client.post(
        "/api/v1/admin/timetable/slots",
        json={
            "faculty_id": identities["faculty_id"],
            "class_id": None,
            "slot_type": "FREE",
            "day_of_week": 1,
            "start_time": "11:00",
            "end_time": "12:00",
            "break_label": "Lunch",
        },
        headers=headers,
    )
    assert free_slot.status_code == 201

    overlap = client.post(
        "/api/v1/admin/timetable/slots",
        json={
            "faculty_id": identities["faculty_id"],
            "class_id": assigned,
            "slot_type": "CLASS",
            "day_of_week": 1,
            "start_time": "09:30",
            "end_time": "10:30",
        },
        headers=headers,
    )
    assert overlap.status_code == 409

    filtered = client.get(
        "/api/v1/admin/timetable",
        params={"slotType": "FREE"},
        headers=headers,
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["slot_type"] == "FREE"

    mine = client.get(
        "/api/v1/timetable/mine",
        headers=auth(identities["faculty_token"]),
    )
    assert mine.status_code == 200
    assert len(mine.json()["items"]) == 2
    other = client.get(
        "/api/v1/timetable/mine",
        headers=auth(identities["other_token"]),
    )
    assert other.status_code == 200
    assert other.json()["items"] == []

    changed = client.patch(
        f"/api/v1/admin/timetable/slots/{class_slot.json()['id']}",
        json={
            "slot_type": "FREE",
            "class_id": None,
            "break_label": "Office hour",
            "version": class_slot.json()["version"],
        },
        headers=headers,
    )
    assert changed.status_code == 200
    assert changed.json()["slot_type"] == "FREE"
    assert changed.json()["class_id"] is None

    invalid_range = client.patch(
        f"/api/v1/admin/timetable/slots/{changed.json()['id']}",
        json={
            "start_time": "13:00",
            "end_time": "12:30",
            "version": changed.json()["version"],
        },
        headers=headers,
    )
    assert invalid_range.status_code == 422

    deleted = client.delete(
        f"/api/v1/admin/timetable/slots/{free_slot.json()['id']}",
        headers=headers,
    )
    assert deleted.status_code == 204
def test_new_faculty_uses_configured_default_password(client, identities):
    headers = auth(identities["admin_token"])
    created = client.post(
        "/api/v1/faculty",
        headers=headers,
        json={
            "email": "new.faculty@christuniversity.in",
            "employee_id": "FAC-DEFAULT",
            "name": "Default Password Faculty",
            "department": "CSE",
            "designation": "Assistant Professor",
        },
    )
    assert created.status_code == 201, created.text
    for identifier in ("new.faculty@christuniversity.in", "FAC-DEFAULT"):
        login = client.post(
            "/api/v1/auth/login",
            json={"identifier": identifier, "password": "LocalTest123!"},
        )
        assert login.status_code == 200, login.text
        assert login.json()["user"]["role"] == "FACULTY"


def test_matching_uses_multiple_templates_and_ambiguity(monkeypatch):
    from app.config import get_settings
    settings=get_settings();monkeypatch.setattr(settings,"match_threshold",0.45);monkeypatch.setattr(settings,"ambiguity_margin",0.05)
    probe=np.array([1.0,0.0,0.0],dtype=np.float32)
    clear=decide_match(probe,{"A":[np.array([1.0,0,0]),np.array([.99,.01,0])],"B":[np.array([0,1.0,0])]})
    assert clear.student_id=="A" and clear.status=="PRESENT"
    ambiguous=decide_match(probe,{"A":[np.array([1.0,0,0])],"B":[np.array([.999,.01,0])]})
    assert ambiguous.student_id is None and ambiguous.status=="REVIEW"


def test_openapi_contains_integration_surface(client):
    schema=client.get("/openapi.json").json();paths=schema["paths"]
    for path in ["/api/v1/auth/login","/api/v1/faculty","/api/v1/students","/api/v1/classes","/api/v1/attendance/sessions","/api/v1/reports/attendance","/api/v1/reports/attendance/export","/api/v1/audit"]:
        assert path in paths
    upload=schema["components"]["schemas"]["Body_upload_session_images_api_v1_attendance_sessions__session_id__images_post"]
    assert upload["properties"]["files"]["items"]["format"]=="binary"


def test_problem_details_and_face_image_count(client, identities):
    missing=client.get("/api/v1/students/not-found",headers=auth(identities["admin_token"]))
    assert missing.status_code==404
    assert missing.headers["content-type"].startswith("application/problem+json")
    response=client.post("/api/v1/students/not-found/face-images",headers=auth(identities["admin_token"]),files=[])
    assert response.status_code in {404,422}


def test_faculty_student_directory_is_assignment_scoped(client, identities):
    _,_,selected,excluded=setup_class_scope(identities)
    response=client.get("/api/v1/students",headers=auth(identities["faculty_token"]))
    ids={item["id"] for item in response.json()["items"]}
    assert selected in ids
    assert excluded not in ids


def _png(color=(30,120,90)):
    image=Image.new("RGB",(160,160),color);target=io.BytesIO();image.save(target,"PNG");return target.getvalue()


def test_face_enrolment_reserves_at_most_five_pending_or_accepted_slots(client, identities):
    _,_,student_id,_=setup_class_scope(identities)
    headers=auth(identities["admin_token"])
    files=[("files",(f"face-{index}.png",_png((20+index,100,140)),"image/png")) for index in range(5)]
    accepted=client.post(f"/api/v1/students/{student_id}/face-images",headers=headers,files=files)
    assert accepted.status_code==201
    rejected=client.post(
        f"/api/v1/students/{student_id}/face-images",
        headers=headers,
        files=[("files",("face-6.png",_png((40,110,150)),"image/png"))],
    )
    assert rejected.status_code==409


def _rotated_phone_jpeg():
    image=Image.new("RGB",(120,60),(30,120,90))
    exif=Image.Exif();exif[274]=6
    target=io.BytesIO();image.save(target,"JPEG",exif=exif);return target.getvalue()


def test_phone_orientation_is_consistent_for_detection_and_preview(client, identities):
    import cv2

    content=_rotated_phone_jpeg()
    validated=validate_image(content)
    decoded=decode_image_pixels(content,cv2)
    assert (validated.width,validated.height)==(60,120)
    assert decoded.shape[:2]==(120,60)

    assigned,_,_,_=setup_class_scope(identities);headers=auth(identities["faculty_token"])
    session=client.post("/api/v1/attendance/sessions",json={"class_ids":[assigned]},headers=headers).json()
    uploaded=client.post(
        f"/api/v1/attendance/sessions/{session['id']}/images",
        headers=headers,
        files=[("files",("phone.jpg",content,"image/jpeg"))],
    )
    assert uploaded.status_code==201
    assert (uploaded.json()["items"][0]["width"],uploaded.json()["items"][0]["height"])==(60,120)
    listed=client.get(f"/api/v1/attendance/sessions/{session['id']}/images",headers=headers).json()["items"]
    annotated=client.get(listed[0]["annotated_url"],headers=headers)
    assert annotated.status_code==200
    with Image.open(io.BytesIO(annotated.content)) as preview:
        assert preview.size==(60,120)


def test_local_multi_image_workflow_and_all_exports(client, identities):
    assigned,_,selected,_=setup_class_scope(identities);headers=auth(identities["faculty_token"])
    session=client.post("/api/v1/attendance/sessions",json={"class_ids":[assigned]},headers=headers).json();sid=session["id"]
    uploaded=client.post(f"/api/v1/attendance/sessions/{sid}/images",headers=headers,files=[("files",("class.png",_png(),"image/png"))])
    assert uploaded.status_code==201
    queued=client.post(f"/api/v1/attendance/sessions/{sid}/process",headers=headers)
    assert queued.status_code==202
    from app.local_worker import run_once
    assert run_once()==1
    result=client.get(f"/api/v1/attendance/sessions/{sid}",headers=headers).json()
    assert result["session"]["status"]=="PENDING_REVIEW"
    assert len(result["records"])==1 and result["records"][0]["student_id"]==selected
    images=client.get(f"/api/v1/attendance/sessions/{sid}/images",headers=headers).json()["items"]
    assert client.get(images[0]["annotated_url"],headers=headers).status_code==200
    for format_,mime in [("csv","text/csv"),("json","application/json"),("xlsx","spreadsheetml"),("pdf","application/pdf")]:
        exported=client.get(f"/api/v1/attendance/sessions/{sid}/export?format={format_}",headers=headers)
        assert exported.status_code==200 and mime in exported.headers["content-type"] and exported.content


def test_panorama_preview_contract_and_session_attachment(client, identities):
    assigned,_,_,_=setup_class_scope(identities);headers=auth(identities["faculty_token"])
    image=validate_image(_png((80, 100, 140)))
    with SessionLocal.begin() as db:
        draft=PanoramaDraft(faculty_id=identities["faculty_id"],object_key="panorama-drafts/test.jpg",
                            checksum=image.checksum,mime_type=image.mime_type,width=image.width,height=image.height)
        db.add(draft);db.flush();draft_id=draft.id
        ObjectStorage().put(draft.object_key,image)
    created=client.post("/api/v1/attendance/sessions",json={"class_ids":[assigned],"capture_mode":"PANORAMA"},headers=headers)
    assert created.status_code==201 and created.json()["capture_mode"]=="PANORAMA"
    attached=client.post(f"/api/v1/attendance/sessions/{created.json()['id']}/panorama",
                         json={"draft_id":draft_id},headers=headers)
    assert attached.status_code==201 and attached.json()["width"]==160
    images=client.get(f"/api/v1/attendance/sessions/{created.json()['id']}/images",headers=headers).json()["items"]
    assert len(images)==1 and client.get(images[0]["image_url"]).status_code==200


def test_panorama_rejects_non_video_upload(client, identities):
    response=client.post("/api/v1/attendance/panorama/preview",headers=auth(identities["faculty_token"]),
                         files={"sweep":("not-video.txt",b"not a video","text/plain")})
    assert response.status_code==415


def test_panorama_sweep_is_stitched_and_previewed(client, identities):
    import cv2
    rng=np.random.default_rng(42)
    canvas=rng.integers(0,256,size=(320,1600,3),dtype=np.uint8)
    for x in range(80,1520,160):
        cv2.circle(canvas,(x,160),35,(255,255,255),5)
        cv2.putText(canvas,str(x),(x-35,250),cv2.FONT_HERSHEY_SIMPLEX,1,(0,0,0),3)
    handle=tempfile.NamedTemporaryFile(suffix=".mp4",delete=False);path=handle.name;handle.close()
    try:
        writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*"mp4v"),8,(640,320))
        assert writer.isOpened()
        for x in np.linspace(0,960,16,dtype=int):writer.write(canvas[:,x:x+640])
        writer.release()
        with open(path,"rb") as source:video=source.read()
    finally:
        try:os.unlink(path)
        except OSError:pass
    response=client.post("/api/v1/attendance/panorama/preview",headers=auth(identities["faculty_token"]),
                         files={"sweep":("classroom.mp4",video,"video/mp4")})
    assert response.status_code==201,response.text
    preview=response.json()
    assert preview["width"]>640 and preview["height"]>200
    image=client.get(preview["photo_uri"])
    assert image.status_code==200 and image.headers["content-type"]=="image/jpeg"


def test_panorama_still_frames_are_stitched_and_previewed(client, identities):
    import cv2
    rng=np.random.default_rng(84)
    canvas=rng.integers(0,256,size=(320,1600,3),dtype=np.uint8)
    for x in range(80,1520,160):
        cv2.circle(canvas,(x,160),35,(255,255,255),5)
        cv2.putText(canvas,str(x),(x-35,250),cv2.FONT_HERSHEY_SIMPLEX,1,(0,0,0),3)
    files=[]
    for index,x in enumerate(np.linspace(0,960,6,dtype=int)):
        encoded,jpeg=cv2.imencode(".jpg",canvas[:,x:x+640],[cv2.IMWRITE_JPEG_QUALITY,92])
        assert encoded
        files.append(("frames",(f"frame-{index}.jpg",jpeg.tobytes(),"image/jpeg")))
    response=client.post("/api/v1/attendance/panorama/frames",headers=auth(identities["faculty_token"]),files=files)
    assert response.status_code==201,response.text
    preview=response.json()
    assert preview["width"]>640 and preview["height"]>200
    image=client.get(preview["photo_uri"])
    assert image.status_code==200 and image.headers["content-type"]=="image/jpeg"


def test_panorama_still_frames_require_at_least_four_images(client, identities):
    files=[("frames",(f"frame-{index}.png",_png((40+index,80,120)),"image/png")) for index in range(3)]
    response=client.post("/api/v1/attendance/panorama/frames",headers=auth(identities["faculty_token"]),files=files)
    assert response.status_code==422


def test_reports_return_real_aggregates_and_honor_scope(client, identities):
    assigned,_,selected,_=setup_class_scope(identities)
    with SessionLocal.begin() as db:
        absent=Student(student_id="S003",roll_number="R003",name="Absent Student",department="CSE",semester=5,section="A")
        db.add(absent);db.flush();db.add(Enrolment(student_id=absent.id,class_id=assigned))
        session=AttendanceSession(faculty_id=identities["faculty_id"],attendance_date=date.today(),status=SessionStatus.FINALIZED)
        db.add(session);db.flush();db.add(AttendanceSessionClass(session_id=session.id,class_id=assigned))
        db.add_all([
            AttendanceRecord(session_id=session.id,student_id=selected,ai_status=AttendanceStatus.PRESENT,status=AttendanceStatus.PRESENT,model_version="test"),
            AttendanceRecord(session_id=session.id,student_id=absent.id,ai_status=AttendanceStatus.ABSENT,status=AttendanceStatus.ABSENT,model_version="test"),
        ])
    headers=auth(identities["faculty_token"])
    report=client.get(f"/api/v1/reports/attendance?classId={assigned}",headers=headers)
    assert report.status_code==200,report.text
    body=report.json()
    assert body["scope"]=="CLASS" and body["totalSessions"]==1 and body["studentCount"]==2
    assert body["overallPercentage"]==50 and body["trend"][0]["present"]==1
    assert body["byClass"][0]["sessionCount"]==1 and body["byClass"][0]["percentage"]==50
    history=client.get(f"/api/v1/attendance/sessions?classId={assigned}&status=FINALIZED&search=Vision",headers=headers).json()
    assert history["total"]==1
    low=client.get(f"/api/v1/reports/attendance/students?classId={assigned}&lowAttendanceOnly=true",headers=headers).json()
    assert low["total"]==1 and low["items"][0]["name"]=="Absent Student"
    exported=client.get(f"/api/v1/reports/attendance/export?classId={assigned}&lowAttendanceOnly=true&format=csv",headers=headers)
    assert exported.status_code==200 and exported.headers["content-type"].startswith("text/csv")
    assert "Absent Student" in exported.text and "Selected Student" not in exported.text
    directory_low=client.get(f"/api/v1/students?classId={assigned}&lowAttendanceOnly=true",headers=headers).json()
    assert directory_low["total"]==1 and directory_low["items"][0]["name"]=="Absent Student"
    course=client.get(f"/api/v1/classes/{assigned}",headers=headers).json()
    assert course["attendance_percentage"]==50
    denied=client.get("/api/v1/reports/attendance?institutionWide=true",headers=headers)
    assert denied.status_code==403


def test_twin_review_contract_contains_renderable_candidates(client, identities):
    assigned,_,selected,_=setup_class_scope(identities)
    with SessionLocal.begin() as db:
        second=Student(student_id="S004",roll_number="R004",name="Similar Student",department="CSE",semester=5,section="A")
        db.add(second);db.flush();db.add(Enrolment(student_id=second.id,class_id=assigned))
        session=AttendanceSession(faculty_id=identities["faculty_id"],attendance_date=date.today(),status=SessionStatus.PENDING_REVIEW)
        db.add(session);db.flush();db.add(AttendanceSessionClass(session_id=session.id,class_id=assigned))
        db.add_all([
            AttendanceRecord(session_id=session.id,student_id=selected,ai_status=AttendanceStatus.REVIEW,status=AttendanceStatus.REVIEW,score=.7,model_version="test"),
            AttendanceRecord(session_id=session.id,student_id=second.id,ai_status=AttendanceStatus.REVIEW,status=AttendanceStatus.REVIEW,score=.68,model_version="test"),
        ])
        review=TwinReview(session_id=session.id,student_a_id=selected,student_b_id=second.id);db.add(review);db.flush();session_id=session.id
    response=client.get(f"/api/v1/attendance/sessions/{session_id}/twin-reviews",headers=auth(identities["faculty_token"]))
    assert response.status_code==200,response.text
    item=response.json()["items"][0]
    assert item["sessionId"]==session_id and item["studentA"]["name"]=="Selected" and item["studentB"]["confidence"]==.68


def test_admin_catalogue_and_audit_filters_are_applied(client, identities):
    assigned,unrelated,_,_=setup_class_scope(identities);headers=auth(identities["admin_token"])
    faculty=client.get(f"/api/v1/faculty?department=CSE&status=ACTIVE&classId={assigned}",headers=headers).json()
    assert faculty["total"]==1 and faculty["items"][0]["id"]==identities["faculty_id"]
    classes=client.get(f"/api/v1/classes?facultyId={identities['other_id']}&semester=3&department=CSE&status=ACTIVE",headers=headers).json()
    assert classes["total"]==1 and classes["items"][0]["id"]==unrelated
    created=client.post("/api/v1/classes",headers=headers,json={"code":"AUD-1","subject":"Audit Test","department":"CSE","semester":1,"section":"A","academic_session":"2026-27"})
    assert created.status_code==201
    audit_rows=client.get(f"/api/v1/audit?actorId={identities['admin_id']}&action=CLASS_CREATED&search=CLASS",headers=headers).json()
    assert audit_rows["total"]==1 and audit_rows["items"][0]["actor_role"]=="ADMIN"


def test_normalized_academic_mapping_and_enrolment_guard(client, identities):
    headers=auth(identities["admin_token"])
    def create(kind, body):
        response=client.post(f"/api/v1/academic/{kind}",json=body,headers=headers)
        assert response.status_code==201,response.text
        return response.json()
    school=create("schools",{"code":"SOC","name":"School of Computing"})
    department=create("departments",{"code":"BCA","name":"Computer Applications","school_id":school["id"]})
    program=create("programs",{"code":"BCA","name":"Bachelor of Computer Applications","department_id":department["id"]})
    batch=create("batches",{"code":"2026","name":"2026 to 2029","program_id":program["id"],"start_year":2026,"end_year":2029})
    section=create("sections",{"code":"A","name":"Section A","batch_id":batch["id"]})
    subject=create("subjects",{"code":"BCA101","name":"Programming Fundamentals"})
    link=client.post(f"/api/v1/academic/programs/{program['id']}/subjects",json={"subject_id":subject["id"],"semester_number":1},headers=headers)
    assert link.status_code==201,link.text
    mapped=client.post("/api/v1/students",json={"student_id":"MAP-1","roll_number":"MAP-1","name":"Mapped Student","department":"legacy","semester":1,"section":"legacy","school_id":school["id"],"department_id":department["id"],"program_id":program["id"],"batch_id":batch["id"],"section_id":section["id"]},headers=headers)
    assert mapped.status_code==201,mapped.text
    assert mapped.json()["mappingStatus"]=="MAPPED"
    course=client.post("/api/v1/classes",json={"code":"BCA101-A","subject":"ignored","department":"ignored","semester":9,"section":"ignored","academic_session":"2026-27","program_subject_id":link.json()["id"],"section_id":section["id"]},headers=headers)
    assert course.status_code==201,course.text
    assert course.json()["subject"]=="Programming Fundamentals" and course.json()["semester"]==1
    enrolled=client.patch(f"/api/v1/classes/{course.json()['id']}/enrolments",json={"add_student_ids":[mapped.json()["id"]]},headers=headers)
    assert enrolled.status_code==204,enrolled.text
    with SessionLocal.begin() as db:
        session=AttendanceSession(
            faculty_id=identities["faculty_id"],
            attendance_date=date.today(),
            status=SessionStatus.FINALIZED,
        )
        db.add(session);db.flush()
        db.add(AttendanceSessionClass(session_id=session.id,class_id=course.json()["id"]))
        db.add(AttendanceRecord(
            session_id=session.id,
            student_id=mapped.json()["id"],
            ai_status=AttendanceStatus.PRESENT,
            status=AttendanceStatus.PRESENT,
            model_version="test",
        ))
    scoped_report=client.get(
        f"/api/v1/reports/attendance?subjectId={subject['id']}&institutionWide=true",
        headers=headers,
    )
    assert scoped_report.status_code==200,scoped_report.text
    assert scoped_report.json()["totalSessions"]==1
    assert scoped_report.json()["scope"]=="SUBJECT"
    assert scoped_report.json()["scopeId"]==subject["id"]
    unrelated_subject=create("subjects",{"code":"BCA102","name":"Database Systems"})
    empty_report=client.get(
        f"/api/v1/reports/attendance?subjectId={unrelated_subject['id']}&institutionWide=true",
        headers=headers,
    )
    assert empty_report.status_code==200,empty_report.text
    assert empty_report.json()["totalSessions"]==0
    legacy=client.post("/api/v1/students",json={"student_id":"MAP-2","roll_number":"MAP-2","name":"Unmapped Student","department":"CSE","semester":1,"section":"A"},headers=headers)
    assert legacy.status_code==201 and legacy.json()["mappingStatus"]=="NEEDS_MAPPING"
    blocked=client.patch(f"/api/v1/classes/{course.json()['id']}/enrolments",json={"add_student_ids":[legacy.json()["id"]]},headers=headers)
    assert blocked.status_code==409 and blocked.json()["title"]=="Student needs academic mapping"
    report=client.get("/api/v1/academic/mapping-report?search=MAP-2",headers=headers).json()
    assert report["total"]==1 and report["items"][0]["legacy"]["department"]=="CSE"

    overview=client.get("/api/v1/academic/overview",headers=headers)
    assert overview.status_code==200,overview.text
    overview_body=overview.json()
    assert overview_body["counts"]["schools"]==1
    assert next(item for item in overview_body["attention"] if item["key"]=="academicPlacement")["count"]==1
    assert next(item for item in overview_body["attention"] if item["key"]=="classesNeedFaculty")["count"]==1

    workspace=client.get(f"/api/v1/academic/schools/{school['id']}",headers=headers)
    assert workspace.status_code==200,workspace.text
    assert workspace.json()["children"][0]["id"]==department["id"]
    assert workspace.json()["counts"]["departments"]==1

    impact=client.get(f"/api/v1/academic/programs/{program['id']}/impact",headers=headers)
    assert impact.status_code==200,impact.text
    assert impact.json()["canArchive"] is False
    assert impact.json()["blocking"]["batches"]==1

    missing_curriculum=client.get("/api/v1/academic/programs?needsCurriculum=true",headers=headers)
    assert missing_curriculum.status_code==200
    assert missing_curriculum.json()["total"]==0
