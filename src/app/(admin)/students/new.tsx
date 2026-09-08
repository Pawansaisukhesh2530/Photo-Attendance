import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
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
import { useCreateStudent } from '@/hooks/useStudents';
import { palette, spacing, useResponsive } from '@/theme';

export default function NewStudentScreen() {
  const { isExpanded } = useResponsive();
  const { data: settings, isLoading: settingsLoading } = useInstitutionSettings();
  const create = useCreateStudent();
  const toast = useToast();

  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('1');
  const [section, setSection] = useState('');
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [semesterPickerOpen, setSemesterPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const departmentOptions = useMemo(
    () =>
      (settings?.departments ?? []).map((value) => ({
        id: value,
        label: value,
        selected: value === department,
      })),
    [department, settings?.departments],
  );

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
    if (!name.trim() || !studentId.trim() || !rollNumber.trim() || !department || !section.trim()) {
      setError('Complete every field.');
      return;
    }

    try {
      const student = await create.mutateAsync({
        name: name.trim(),
        studentId: studentId.trim(),
        rollNumber: rollNumber.trim(),
        department,
        semester: Number(semester),
        section: section.trim().toUpperCase(),
      });
      toast.show({ message: `${student.name} added`, tone: 'success' });
      router.replace({
        pathname: '/(admin)/students/[studentId]',
        params: { studentId: student.id },
      });
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : 'Could not add student.');
    }
  };

  const hasDepartments = departmentOptions.length > 0;

  return (
    <AdminScaffold
      active="students"
      title="Add student"
      subtitle="Create the student before enrolling face photos"
      breadcrumbs={[
        { label: 'Administration', href: '/(admin)/dashboard' },
        { label: 'Students', href: '/(admin)/students' },
        { label: 'Add student' },
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
          />
          <View style={styles.gap} />
          <Input
            label="Roll number"
            value={rollNumber}
            onChangeText={setRollNumber}
            placeholder="CSE-01"
            autoCapitalize="characters"
          />
        </Card>

        <View style={styles.section}>
          <SectionHeader title="Academic details" divider />
          <Card>
            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurface}>
                Department
              </Text>
              <Button
                label={department || (settingsLoading ? 'Loading departments…' : 'Select department')}
                icon="classes"
                variant="secondary"
                fullWidth
                disabled={settingsLoading || !hasDepartments}
                onPress={() => setDepartmentPickerOpen(true)}
              />
              {!settingsLoading && !hasDepartments ? (
                <Text variant="labelMd" color={palette.error}>
                  Add a department in Settings before creating students.
                </Text>
              ) : null}
            </View>

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

            <Input
              label="Section"
              value={section}
              onChangeText={(value) => setSection(value.toUpperCase())}
              placeholder="A"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              helperText="Section is saved in uppercase for consistent filtering."
            />
          </Card>
        </View>

        <Button
          label="Add student"
          icon="add"
          fullWidth
          loading={create.isPending}
          disabled={create.isPending || settingsLoading || !hasDepartments}
          onPress={() => void save()}
          style={styles.save}
        />
      </Screen>

      <SelectionSheet
        visible={departmentPickerOpen}
        title="Choose department"
        subtitle="Only departments saved by an administrator are available."
        options={departmentOptions}
        onSelect={(value) => {
          setDepartment(value);
          setDepartmentPickerOpen(false);
        }}
        onClose={() => setDepartmentPickerOpen(false)}
        searchable
        emptyMessage="Add a department in Settings first."
      />
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
