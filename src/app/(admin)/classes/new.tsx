import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  Button,
  Card,
  ClassCodeTag,
  FilterChips,
  Input,
  Screen,
  SectionHeader,
  Text,
  useToast,
  type FilterChipOption,
} from '@/components';
import { useClass } from '@/hooks/useClasses';
import { useCreateClass, useUpdateClass } from '@/hooks/useClassAdmin';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, spacing, useResponsive } from '@/theme';

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
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  const isEdit = Boolean(classId);
  const { isExpanded } = useResponsive();
  const toast = useToast();

  const { data: settings } = useInstitutionSettings();
  const { data: existing, isLoading: loadingExisting } = useClass(classId);

  const create = useCreateClass();
  const update = useUpdateClass();
  const pending = create.isPending || update.isPending;

  const [subject, setSubject] = useState('');
  const [classCode, setClassCode] = useState('');
  const [section, setSection] = useState('');
  const [semester, setSemester] = useState('1');
  const [department, setDepartment] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  // Seeded once, so a background refetch cannot overwrite in-progress edits.
  if (isEdit && existing && !seeded) {
    setSubject(existing.subject);
    setClassCode(existing.classCode);
    setSection(existing.section);
    setSemester(String(existing.semester));
    setDepartment(existing.department ?? '');
    setSeeded(true);
  }

  const departmentOptions = useMemo<FilterChipOption<string>[]>(
    () => (settings?.departments ?? []).map((d) => ({ value: d, label: d })),
    [settings],
  );

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

    try {
      if (isEdit && classId) {
        const saved = await update.mutateAsync({
          classId,
          subject,
          classCode,
          section,
          semester: Number(semester),
          department,
        });
        toast.show({ message: `${saved.displayCode} updated`, tone: 'success' });
      } else {
        const saved = await create.mutateAsync({
          subject,
          classCode,
          section,
          semester: Number(semester),
          department,
          academicSession: settings?.academicSession ?? '2026-27',
        });
        toast.show({ message: `${saved.displayCode} created`, tone: 'success' });
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
    section,
    semester,
    department,
    settings,
    create,
    update,
    toast,
  ]);

  const title = isEdit ? 'Edit class' : 'Create class';

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
        {banner ? (
          <View style={styles.block}>
            <Card style={styles.banner}>
              <Text variant="bodyMd" color={palette.onErrorContainer}>
                {banner}
              </Text>
            </Card>
          </View>
        ) : null}

        <View style={styles.block}>
          <SectionHeader title="Identity" divider />
          <Card>
            <Input
              label="Subject"
              value={subject}
              onChangeText={setSubject}
              placeholder="Operating Systems"
              icon="classes"
              {...(fieldErrors.subject ? { error: fieldErrors.subject } : {})}
            />
            <View style={styles.gap} />
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
              <View style={styles.rowItem}>
                <Input
                  label="Section"
                  value={section}
                  onChangeText={setSection}
                  placeholder="A"
                  autoCapitalize="characters"
                  {...(fieldErrors.section ? { error: fieldErrors.section } : {})}
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
          <SectionHeader title="Placement" divider />
          <Card>
            <Input
              label="Department"
              value={department}
              onChangeText={setDepartment}
              placeholder="Computer Science"
              autoCapitalize="words"
              {...(fieldErrors.department ? { error: fieldErrors.department } : {})}
            />
            {departmentOptions.length > 0 ? (
              <View style={styles.field}>
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  SAVED DEPARTMENTS
                </Text>
                <FilterChips
                  options={departmentOptions}
                  selected={department}
                  onSelect={setDepartment}
                  contentInset={0}
                />
              </View>
            ) : null}

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
                : 'A new class starts with no lecturer and no enrolled students. Both are set afterwards.'}
            </Text>
          </Card>
        </View>

        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => router.back()}
            disabled={pending}
            style={styles.action}
          />
          <Button
            label={isEdit ? 'Save changes' : 'Create class'}
            icon="check"
            onPress={() => void submit()}
            loading={pending}
            disabled={pending || (isEdit && loadingExisting)}
            style={styles.action}
          />
        </View>
      </Screen>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
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
