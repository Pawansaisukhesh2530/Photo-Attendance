import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  AcademicHierarchyFields,
  Button,
  Badge,
  Card,
  ClassCodeTag,
  FilterChips,
  Input,
  Screen,
  SectionHeader,
  SelectionSheet,
  Text,
  useToast,
  type FilterChipOption,
} from '@/components';
import { useClass } from '@/hooks/useClasses';
import { useAssignFaculty, useCreateClass, useUpdateClass, useUpdateEnrolment } from '@/hooks/useClassAdmin';
import { useInfiniteFaculty } from '@/hooks/useFacultyAdmin';
import { useStudents } from '@/hooks/useStudents';
import { useCreateTimetableSlot } from '@/hooks/useTimetable';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { useAcademicTree } from '@/hooks/useAcademic';
import { palette, spacing, useResponsive } from '@/theme';

const CREATE_STEPS = ['Class', 'Faculty', 'Roster', 'Timetable', 'Review'] as const;

/**
 * Create or edit a class.
 *
 * One screen for both; `?classId=` switches to edit mode.
 *
 * `displayCode` is never entered directly — it is derived from the code and section, here for
 * preview and again on the server, which is authoritative. A label that could be typed
 * independently of its parts would eventually disagree with them.
 *
 * Lecturer assignment is deliberately absent from this form. It is its own audited operation, done
 * from class detail or a faculty profile, so creating a class and staffing it stay separable.
 */
export default function AdminClassFormScreen() {
  const params = useLocalSearchParams<{ classId?: string; schoolId?: string; departmentId?: string; programId?: string; batchId?: string; sectionId?: string }>();
  const { classId } = params;
  const isEdit = Boolean(classId);
  const { isExpanded } = useResponsive();
  const toast = useToast();

  const { data: settings } = useInstitutionSettings();
  const academic=useAcademicTree();
  const { data: existing, isLoading: loadingExisting } = useClass(classId);

  const create = useCreateClass();
  const update = useUpdateClass();
  const assignFaculty = useAssignFaculty();
  const updateEnrolment = useUpdateEnrolment();
  const createSlot = useCreateTimetableSlot();
  const pending = create.isPending || update.isPending || assignFaculty.isPending || updateEnrolment.isPending || createSlot.isPending;

  const [subject, setSubject] = useState('');
  const [classCode, setClassCode] = useState('');
  const [variant, setVariant] = useState('Lecture');
  const [section, setSection] = useState('');
  const [semester, setSemester] = useState('1');
  const [department, setDepartment] = useState('');
  const [hierarchy,setHierarchy]=useState({schoolId:params.schoolId??'',departmentId:params.departmentId??'',programId:params.programId??'',batchId:params.batchId??'',sectionId:params.sectionId??''});
  const inherited=useMemo(()=>({schoolId:Boolean(params.schoolId),departmentId:Boolean(params.departmentId),programId:Boolean(params.programId),batchId:Boolean(params.batchId),sectionId:Boolean(params.sectionId)}),[params.schoolId,params.departmentId,params.programId,params.batchId,params.sectionId]);
  const [programSubjectId,setProgramSubjectId]=useState('');
  const [seeded, setSeeded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [subjectPickerOpen,setSubjectPickerOpen]=useState(false);
  const [step,setStep]=useState(0);
  const [facultyPickerOpen,setFacultyPickerOpen]=useState(false);
  const [studentPickerOpen,setStudentPickerOpen]=useState(false);
  const [facultyId,setFacultyId]=useState('');
  const [studentIds,setStudentIds]=useState<string[]>([]);
  const [slotDay,setSlotDay]=useState('');
  const [slotStart,setSlotStart]=useState('');
  const [slotEnd,setSlotEnd]=useState('');
  const [slotRoom,setSlotRoom]=useState('');

  const faculty=useInfiniteFaculty({status:'ACTIVE',...(hierarchy.departmentId?{departmentId:hierarchy.departmentId}:{}),pageSize:100});
  const facultyOptions=useMemo(()=>(faculty.data?.pages??[]).flatMap(page=>page.items).map(item=>({id:item.id,label:item.name,description:`${item.employeeId} · ${item.designation}`,selected:item.id===facultyId})),[faculty.data,facultyId]);
  const roster=useStudents({sectionId:hierarchy.sectionId||'__pending__',pageSize:100});
  const rosterRows=(roster.data?.items??[]).filter((student)=>student.active);

  // Seeded once, so a background refetch cannot overwrite in-progress edits.
  if (isEdit && existing && !seeded) {
    setSubject(existing.subject);
    setClassCode(existing.classCode);
    setVariant(existing.variant);
    setSection(existing.section);
    setSemester(String(existing.semester));
    setDepartment(existing.department ?? '');
    setHierarchy({
      schoolId: existing.schoolId ?? '',
      departmentId: existing.departmentId ?? '',
      programId: existing.programId ?? '',
      batchId: existing.batchId ?? '',
      sectionId: existing.sectionId ?? '',
    });
    setProgramSubjectId(existing.programSubjectId ?? '');
    setSeeded(true);
  }

  const subjectOptions=useMemo(()=>{if(!academic.data||!hierarchy.programId)return[];return academic.data.programSubjects.filter(x=>x.programId===hierarchy.programId).map(link=>{const value=academic.data!.subjects.find(x=>x.id===link.subjectId);return value?{id:link.id,label:value.name,description:`${value.code}${link.semesterNumber?` · Semester ${link.semesterNumber}`:''}`,selected:link.id===programSubjectId}:null}).filter((x):x is NonNullable<typeof x>=>!!x)},[academic.data,hierarchy.programId,programSubjectId]);

  const semesterOptions = useMemo<FilterChipOption<string>[]>(() => {
    const count = settings?.semesterCount ?? 8;
    return Array.from({ length: count }, (_, i) => ({
      value: String(i + 1),
      label: `Sem ${i + 1}`,
    }));
  }, [settings]);

  const previewCode = `${classCode.trim()}${section.trim()}`;

  const submit = useCallback(async () => {
    setFieldErrors({});
    setBanner(null);

    if(!hierarchy.sectionId||!programSubjectId){setBanner('Select a complete hierarchy and programme subject.');return}
    try {
      if (isEdit && classId) {
        const saved = await update.mutateAsync({
          classId,
          subject,
          classCode,
          variant,
          section,
          semester: Number(semester),
          department,
          programSubjectId,sectionId:hierarchy.sectionId,
        });
        toast.show({ message: `${saved.displayCode} updated`, tone: 'success' });
      } else {
        const saved = await create.mutateAsync({
          subject,
          classCode,
          variant,
          section,
          semester: Number(semester),
          department,
          academicSession: settings?.academicSession ?? '2026-27',
          programSubjectId,sectionId:hierarchy.sectionId,
        });
        try {
          if (facultyId) {
            await assignFaculty.mutateAsync({ classId: saved.id, facultyId });
          }
          if (studentIds.length > 0) {
            await updateEnrolment.mutateAsync({ classId: saved.id, addStudentIds: studentIds });
          }
          if (facultyId && slotDay && slotStart && slotEnd) {
            await createSlot.mutateAsync({
              faculty_id: facultyId,
              class_id: saved.id,
              slot_type: 'CLASS',
              day_of_week: Number(slotDay),
              start_time: slotStart,
              end_time: slotEnd,
              room: slotRoom.trim() || null,
            });
          }
        } catch (setupError) {
          toast.show({
            message: `Class created, but part of its setup needs attention: ${isApiError(setupError) ? setupError.message : 'open the class workspace to finish setup.'}`,
            tone: 'error',
          });
          router.replace({ pathname:'/(admin)/classes/[classId]', params:{ classId:saved.id } });
          return;
        }
        toast.show({ message: `${saved.displayCode} created`, tone: 'success' });
        router.replace({ pathname:'/(admin)/classes/[classId]', params:{ classId:saved.id } });
        return;
      }
      router.back();
    } catch (error) {
      if (isApiError(error) && error.kind === 'VALIDATION' && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
        return;
      }
      setBanner(isApiError(error) ? error.message : 'Could not save. Please try again.');
    }
  }, [
    isEdit,
    classId,
    subject,
    classCode,
    variant,
    section,
    semester,
    department,
    hierarchy,programSubjectId,facultyId,studentIds,slotDay,slotStart,slotEnd,slotRoom,
    settings,
    create,assignFaculty,updateEnrolment,createSlot,
    update,
    toast,
  ]);

  const title = isEdit ? 'Edit class' : 'Create class';

  const nextStep = useCallback(() => {
    setBanner(null);
    if (step === 0 && (!hierarchy.sectionId || !programSubjectId || !classCode.trim())) {
      setBanner('Complete the academic placement, programme subject, and class code before continuing.');
      return;
    }
    if (step === 3) {
      const anyTimetableValue = Boolean(slotDay || slotStart || slotEnd || slotRoom.trim());
      const validDay = !slotDay || [1,2,3,4,5].includes(Number(slotDay));
      const completeSlot = Boolean(slotDay && slotStart && slotEnd);
      if ((anyTimetableValue && !completeSlot) || !validDay || (slotStart && slotEnd && slotStart >= slotEnd)) {
        setBanner('Enter a weekday from 1 to 5 and a valid start/end time, or leave the timetable empty to configure it later.');
        return;
      }
    }
    setStep((value) => Math.min(value + 1, CREATE_STEPS.length - 1));
  }, [step, hierarchy.sectionId, programSubjectId, classCode, slotDay, slotStart, slotEnd, slotRoom]);

  return (
    <AdminScaffold
      active="classes"
      title={title}
      subtitle={isEdit ? existing?.displayCode : 'New class'}
      breadcrumbs={[
        { label: 'Administration', href: '/(admin)/dashboard' },
        { label: 'Classes', href: '/(admin)/classes' },
        { label: title },
      ]}
      onBack={() => router.back()}
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <Screen scrollable respectBottomInset={!isExpanded} contentContainerStyle={styles.content}>
        {!isEdit ? (
          <View style={styles.stepRow}>
            {CREATE_STEPS.map((label,index)=>(
              <View key={label} style={[styles.stepPill,index===step&&styles.stepPillActive,index<step&&styles.stepPillDone]}>
                <Text variant="labelMd" color={index===step?palette.onPrimary:index<step?palette.onSecondaryContainer:palette.onSurfaceVariant}>
                  {index<step?'✓':index+1} {label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {banner ? (
          <View style={styles.block}>
            <Card style={styles.banner}>
              <Text variant="bodyMd" color={palette.onErrorContainer}>
                {banner}
              </Text>
            </Card>
          </View>
        ) : null}

        {isEdit || step===0 ? <><View style={styles.block}>
          <SectionHeader title="Academic context and class" divider />
          <Card>
            <AcademicHierarchyFields value={hierarchy} locked={inherited} onChange={value=>{setHierarchy(value);setProgramSubjectId('');setSubject('');setFacultyId('');setStudentIds([]);const d=academic.data?.departments.find(x=>x.id===value.departmentId);const s=academic.data?.sections.find(x=>x.id===value.sectionId);setDepartment(d?.code??'');setSection(s?.code??'')}} />
            <View style={styles.gap} />
            <View style={styles.field}><Text variant="labelMd" color={palette.onSurface}>Programme subject</Text><Button label={subject||'Select subject'} variant="secondary" fullWidth disabled={!hierarchy.programId||subjectOptions.length===0} onPress={()=>setSubjectPickerOpen(true)}/></View>
            <View style={styles.gap} />
            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurface}>Class type</Text>
              <FilterChips options={(settings?.classTypes ?? ['Lecture','Lab','Tutorial']).map((value)=>({value,label:value}))} selected={variant} onSelect={setVariant} contentInset={0} />
            </View>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Input
                  label="Class code"
                  value={classCode}
                  onChangeText={setClassCode}
                  placeholder="CSE-4"
                  autoCapitalize="characters"
                  {...(fieldErrors.classCode ? { error: fieldErrors.classCode } : {})}
                />
              </View>
            </View>

            {previewCode.length > 0 ? (
              <View style={styles.preview}>
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  Display code
                </Text>
                <ClassCodeTag code={previewCode} />
                <Text variant="labelMd" color={palette.outline} style={styles.flex}>
                  Derived from the code and section.
                </Text>
              </View>
            ) : null}
          </Card>
        </View>

        <View style={styles.block}>
          <SectionHeader title="Session details" divider />
          <Card>
            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                SEMESTER
              </Text>
              <FilterChips
                options={semesterOptions}
                selected={semester}
                onSelect={setSemester}
                contentInset={0}
              />
            </View>

            <Text variant="labelMd" color={palette.outline} style={styles.note}>
              {isEdit
                ? 'A lecturer is assigned from the class detail screen, so the change is audited separately.'
                : 'Continue to choose Faculty, confirm the Section roster, add a timetable slot, and review everything before creation.'}
            </Text>
          </Card>
        </View></> : null}

        {!isEdit && step===1 ? (
          <View style={styles.block}>
            <SectionHeader title="Faculty" meta="Optional during setup" divider />
            <Card>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Assign an active faculty member from this department, or continue and assign one later from the class workspace.
              </Text>
              <Button
                label={facultyOptions.find(item=>item.id===facultyId)?.label ?? 'Choose faculty'}
                icon="faculty"
                variant="secondary"
                fullWidth
                onPress={()=>setFacultyPickerOpen(true)}
                style={styles.topGap}
              />
            </Card>
          </View>
        ) : null}

        {!isEdit && step===2 ? (
          <View style={styles.block}>
            <SectionHeader title="Roster" meta={`${studentIds.length} selected`} divider />
            <Card>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Only active students mapped to the selected Section can be enrolled.
              </Text>
              <View style={styles.selectedWrap}>
                {studentIds.map(id=>{
                  const student=rosterRows.find(item=>item.id===id);
                  return student?<Badge key={id} label={`${student.rollNumber} · ${student.name}`} icon="students"/>:null;
                })}
              </View>
              <Button label="Choose students" icon="add" variant="secondary" fullWidth onPress={()=>setStudentPickerOpen(true)} style={styles.topGap}/>
              {studentIds.length>0?<Button label="Clear roster selection" variant="ghost" fullWidth onPress={()=>setStudentIds([])}/>:null}
            </Card>
          </View>
        ) : null}

        {!isEdit && step===3 ? (
          <View style={styles.block}>
            <SectionHeader title="Timetable" meta="Optional during setup" divider />
            <Card>
              <Input label="Day (1 Monday – 5 Friday)" value={slotDay} onChangeText={setSlotDay} keyboardType="number-pad" placeholder="1" />
              <View style={styles.row}>
                <View style={styles.rowItem}><Input label="Start time" value={slotStart} onChangeText={setSlotStart} placeholder="09:00" /></View>
                <View style={styles.rowItem}><Input label="End time" value={slotEnd} onChangeText={setSlotEnd} placeholder="10:00" /></View>
              </View>
              <Input label="Room" value={slotRoom} onChangeText={setSlotRoom} placeholder="Room 301" />
              <Text variant="labelMd" color={palette.outline}>Leave these fields empty to configure the timetable from the class workspace later.</Text>
            </Card>
          </View>
        ) : null}

        {!isEdit && step===4 ? (
          <View style={styles.block}>
            <SectionHeader title="Review" divider />
            <Card padded={false}>
              {[
                ['Academic path', [hierarchy.schoolId,hierarchy.departmentId,hierarchy.programId,hierarchy.batchId,hierarchy.sectionId].every(Boolean)?'Complete':'Incomplete'],
                ['Subject', subject||'Not selected'],
                ['Class', `${classCode.trim()} · ${variant}`],
                ['Faculty', facultyOptions.find(item=>item.id===facultyId)?.label??'Not selected'],
                ['Roster', `${studentIds.length} students`],
                ['Timetable', slotDay&&slotStart&&slotEnd?`Day ${slotDay} · ${slotStart}–${slotEnd}`:'Configure later'],
              ].map(([label,value],index,array)=><View key={label} style={[styles.reviewRow,index<array.length-1&&styles.reviewDivider]}><Text variant="bodyMd" color={palette.onSurfaceVariant}>{label}</Text><Text variant="bodyMd" color={palette.onSurface} style={styles.reviewValue}>{value}</Text></View>)}
            </Card>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={!isEdit&&step>0?'Back':'Cancel'}
            variant="secondary"
            onPress={() => !isEdit&&step>0?setStep(value=>value-1):router.back()}
            disabled={pending}
            style={styles.action}
          />
          <Button
            label={isEdit ? 'Save changes' : step===CREATE_STEPS.length-1 ? 'Create class' : 'Continue'}
            icon="check"
            onPress={() => isEdit||step===CREATE_STEPS.length-1?void submit():nextStep()}
            loading={pending}
            disabled={pending || (isEdit && loadingExisting)}
            style={styles.action}
          />
        </View>
      </Screen>
      <SelectionSheet
        visible={subjectPickerOpen}
        title="Choose programme subject"
        subtitle="Only subjects assigned to the selected programme are available."
        options={subjectOptions}
        onSelect={(value) => {
          setProgramSubjectId(value);const link=academic.data?.programSubjects.find(x=>x.id===value);const selected=academic.data?.subjects.find(x=>x.id===link?.subjectId);setSubject(selected?.name??'');if(link?.semesterNumber)setSemester(String(link.semesterNumber));setSubjectPickerOpen(false);
        }}
        onClose={() => setSubjectPickerOpen(false)}
        searchable
        emptyMessage="Assign subjects to this programme in Academic structure first."
      />
      <SelectionSheet visible={facultyPickerOpen} title="Choose faculty" subtitle="Only active faculty in this department are shown." searchable options={facultyOptions} onSelect={(value)=>{setFacultyId(value);setFacultyPickerOpen(false)}} onClose={()=>setFacultyPickerOpen(false)} emptyMessage="No mapped faculty are available. Continue and assign one later from the class workspace." />
      <SelectionSheet visible={studentPickerOpen} title="Add a student" subtitle="Choose one student, then reopen to add another." searchable options={rosterRows.filter(item=>!studentIds.includes(item.id)).map(item=>({id:item.id,label:item.name,description:item.rollNumber,icon:'students' as const}))} onSelect={(value)=>{setStudentIds(items=>items.includes(value)?items:[...items,value]);setStudentPickerOpen(false)}} onClose={()=>setStudentPickerOpen(false)} emptyMessage="Every student in this Section is selected." />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  stepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  stepPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: palette.surfaceContainerHigh,
  },
  stepPillActive: {
    backgroundColor: palette.primary,
  },
  stepPillDone: {
    backgroundColor: palette.secondaryContainer,
  },
  block: {
    marginTop: spacing.md,
  },
  banner: {
    backgroundColor: palette.errorContainer,
    borderColor: palette.error,
  },
  gap: {
    height: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowItem: {
    flex: 1,
  },
  topGap: {
    marginTop: spacing.md,
  },
  selectedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
  },
  reviewDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  reviewValue: {
    flex: 1,
    textAlign: 'right',
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.outlineVariant,
  },
  field: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  note: {
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  action: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
});
