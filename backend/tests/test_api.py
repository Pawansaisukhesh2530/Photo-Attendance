from datetime import date

from sqlalchemy import select

from app.db import SessionLocal
from app.domain import build_safe_unknown_records, candidate_student_ids
from app.models import (AttendanceRecord, AttendanceSession, AttendanceSessionClass,
                        AttendanceStatus, CourseClass, Enrolment, FacultyClassAssignment,
                        PanoramaDraft, SessionStatus, Student, TwinReview)
from tests.conftest import auth
import numpy as np
from app.recognition import decide_match
from app.worker import resolve_student_status
from PIL import Image
import io
import os
import tempfile
from app.storage import ObjectStorage, validate_image


def test_successful_no_match_is_absent_but_missing_inputs_stay_unknown():
    absent=resolve_student_status("S001",True,{},set(),set(),1)
    assert absent==(AttendanceStatus.ABSENT,None,"NO_MATCH_OBSERVED")
    no_gallery=resolve_student_status("S001",False,{},set(),set(),1)
    assert no_gallery==(AttendanceStatus.UNKNOWN,None,"NO_ACTIVE_FACE_ENROLMENT")
    no_image=resolve_student_status("S001",True,{},set(),set(),0)
    assert no_image==(AttendanceStatus.UNKNOWN,None,"NO_USABLE_SESSION_IMAGE")


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
        build_safe_unknown_records(db, session)
        build_safe_unknown_records(db, session)
        records = list(db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)))
        assert len(records) == 1
        assert records[0].student_id == selected
        assert records[0].status == AttendanceStatus.UNKNOWN


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
    sid=response.json()["id"]
    first=client.patch(f"/api/v1/students/{sid}",json={"name":"Updated","version":1},headers=auth(identities["admin_token"]))
    assert first.status_code==200
    stale=client.patch(f"/api/v1/students/{sid}",json={"name":"Stale","version":1},headers=auth(identities["admin_token"]))
    assert stale.status_code==409


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
    for path in ["/api/v1/auth/login","/api/v1/faculty","/api/v1/students","/api/v1/classes","/api/v1/attendance/sessions","/api/v1/reports/attendance","/api/v1/audit"]:
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
    created=client.post("/api/v1/classes",headers=headers,json={"code":"AUD-1","subject":"Audit Test","department":"ECE","semester":1,"section":"A","academic_session":"2026-27"})
    assert created.status_code==201
    audit_rows=client.get(f"/api/v1/audit?actorId={identities['admin_id']}&action=CLASS_CREATED&search=CLASS",headers=headers).json()
    assert audit_rows["total"]==1 and audit_rows["items"][0]["actor_role"]=="ADMIN"
