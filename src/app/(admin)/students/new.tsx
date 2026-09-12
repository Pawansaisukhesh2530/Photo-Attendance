import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  AcademicHierarchyFields,
  Button,
  Card,
  Input,
  Screen,
  SectionHeader,
  SelectionSheet,
  Text,
  useToast,
} from '@/components';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { useAcademicTree } from '@/hooks/useAcademic';
import { useCreateStudent, useStudent, useUpdateStudent } from '@/hooks/useStudents';
import { palette, spacing, useResponsive } from '@/theme';

export default function NewStudentScreen() {
  const params = useLocalSearchParams<{ studentId?:string; schoolId?:string; departmentId?:string; programId?:string; batchId?:string; sectionId?:string }>();
  const isEdit = Boolean(params.studentId);
  const { isExpanded } = useResponsive();
  const { data: settings } = useInstitutionSettings();
  const academic = useAcademicTree();
  const create = useCreateStudent();
  const update = useUpdateStudent();
  const { data:existing } = useStudent(params.studentId);
  const toast = useToast();

  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [schoolId,setSchoolId]=useState(params.schoolId??'');const [departmentId,setDepartmentId]=useState(params.departmentId??'');const [programId,setProgramId]=useState(params.programId??'');const [batchId,setBatchId]=useState(params.batchId??'');const [sectionId,setSectionId]=useState(params.sectionId??'');
  const inherited=useMemo(()=>({schoolId:Boolean(params.schoolId),departmentId:Boolean(params.departmentId),programId:Boolean(params.programId),batchId:Boolean(params.batchId),sectionId:Boolean(params.sectionId)}),[params.schoolId,params.departmentId,params.programId,params.batchId,params.sectionId]);
  const [semester, setSemester] = useState('1');
  const [semesterPickerOpen, setSemesterPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded,setSeeded]=useState(false);

  if (isEdit && existing && !seeded) {
    setName(existing.name);
    setStudentId(existing.studentId);
    setRollNumber(existing.rollNumber);
    setSchoolId(existing.schoolId ?? '');
    setDepartmentId(existing.departmentId ?? '');
    setProgramId(existing.programId ?? '');
    setBatchId(existing.batchId ?? '');
    setSectionId(existing.sectionId ?? '');
    setSemester(String(existing.semester));
    setSeeded(true);
  }


  const semesterOptions = useMemo(
    () =>
      Array.from({ length: settings?.semesterCount ?? 8 }, (_, index) => {
        const value = String(index + 1);
        return {
          id: value,
          label: `Semester ${value}`,
          selected: value === semester,
        };
      }),
    [semester, settings?.semesterCount],
  );

  const save = async () => {
    setError(null);
    if (!name.trim() || !studentId.trim() || !rollNumber.trim() || !schoolId || !departmentId || !programId || !batchId || !sectionId) {
      setError('Complete every field.');
      return;
    }

    try {
      const request = {
        name: name.trim(),
        department: academic.data?.departments.find(x=>x.id===departmentId)?.code??'',
        semester: Number(semester),
        section: academic.data?.sections.find(x=>x.id===sectionId)?.code??'',
        schoolId,departmentId,programId,batchId,sectionId,
      };
      const student = isEdit && existing
        ? await update.mutateAsync({ ...request, studentId:existing.id, active:existing.active, version:existing.version })
        : await create.mutateAsync({ ...request, studentId:studentId.trim(), rollNumber:rollNumber.trim() });
      toast.show({ message: `${student.name} ${isEdit ? 'updated' : 'added'}`, tone: 'success' });
      router.replace({
        pathname: '/(admin)/students/[studentId]',
        params: { studentId: student.id },
      });
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : `Could not ${isEdit ? 'update' : 'add'} student.`);
    }
  };

  const hasHierarchy = (academic.data?.schools.filter(x=>x.active).length??0)>0;

  return (
    <AdminScaffold
      active="students"
      title={isEdit ? 'Edit student' : 'Add student'}
      subtitle={isEdit ? existing?.name : 'Create the student before enrolling face photos'}
      breadcrumbs={[
        { label: 'Administration', href: '/(admin)/dashboard' },
        { label: 'Students', href: '/(admin)/students' },
        { label: isEdit ? 'Edit student' : 'Add student' },
      ]}
      onBack={() => router.back()}
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <Screen scrollable respectBottomInset={!isExpanded} contentContainerStyle={styles.content}>
        {error ? (
          <Card style={styles.error}>
            <Text color={palette.onErrorContainer}>{error}</Text>
          </Card>
        ) : null}

        <SectionHeader title="Student identity" divider />
        <Card>
          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Student name"
            autoCapitalize="words"
          />
          <View style={styles.gap} />
          <Input
            label="Student ID"
            value={studentId}
            onChangeText={setStudentId}
            placeholder="24112515"
            autoCapitalize="characters"
            editable={!isEdit}
          />
          <View style={styles.gap} />
          <Input
            label="Roll number"
            value={rollNumber}
            onChangeText={setRollNumber}
            placeholder="CSE-01"
            autoCapitalize="characters"
            editable={!isEdit}
          />
        </Card>

        <View style={styles.section}>
          <SectionHeader title="Academic details" divider />
          <Card>
            <AcademicHierarchyFields value={{schoolId,departmentId,programId,batchId,sectionId}} locked={inherited} onChange={value=>{setSchoolId(value.schoolId);setDepartmentId(value.departmentId);setProgramId(value.programId);setBatchId(value.batchId);setSectionId(value.sectionId)}} />
            {!academic.isLoading&&!hasHierarchy?<Text variant="labelMd" color={palette.error}>Create the academic hierarchy before adding students.</Text>:null}

            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurface}>
                Semester
              </Text>
              <Button
                label={`Semester ${semester}`}
                icon="classes"
                variant="secondary"
                fullWidth
                onPress={() => setSemesterPickerOpen(true)}
              />
            </View>

          </Card>
        </View>

        <Button
          label={isEdit ? 'Save changes' : 'Add student'}
          icon={isEdit ? 'check' : 'add'}
          fullWidth
          loading={create.isPending || update.isPending}
          disabled={create.isPending || update.isPending || academic.isLoading || !hasHierarchy}
          onPress={() => void save()}
          style={styles.save}
        />
      </Screen>

      <SelectionSheet
        visible={semesterPickerOpen}
        title="Choose semester"
        options={semesterOptions}
        onSelect={(value) => {
          setSemester(value);
          setSemesterPickerOpen(false);
        }}
        onClose={() => setSemesterPickerOpen(false)}
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: spacing.xl,
  },
  gap: {
    height: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
  },
  field: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  save: {
    marginTop: spacing.lg,
  },
  error: {
    marginBottom: spacing.md,
    backgroundColor: palette.errorContainer,
  },
});
