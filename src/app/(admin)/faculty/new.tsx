import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  Button,
  Card,
  FilterChips,
  Input,
  Screen,
  SectionHeader,
  SelectionSheet,
  Text,
  useToast,
} from '@/components';
import {
  useCreateFaculty,
  useFacultyMember,
  useUpdateFaculty,
} from '@/hooks/useFacultyAdmin';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, spacing, useResponsive } from '@/theme';
import type { FacultyStatus } from '@/types';

const DEPARTMENTS = ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT', 'AI & DS', 'AIML', 'MBA'];
const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Teaching Assistant'];

/**
 * Create or edit a faculty member.
 *
 * One screen for both, because the fields, the validation and the layout are identical — two would
 * be two places to keep in step. `?facultyId=` switches it to edit mode.
 *
 * Validation is the server's job and this screen shows what the server says: `VALIDATION` errors
 * carry `fieldErrors`, which are attached to the matching input rather than flattened into one
 * banner. The client checks only that required fields are non-empty, so it can never accept
 * something the backend would reject for a reason the client invented.
 */
export default function AdminFacultyFormScreen() {
  const { facultyId } = useLocalSearchParams<{ facultyId?: string }>();
  const isEdit = Boolean(facultyId);
  const { isExpanded } = useResponsive();
  const toast = useToast();

  const { data: settings } = useInstitutionSettings();
  const { data: existing, isLoading: loadingExisting } = useFacultyMember(facultyId);

  const create = useCreateFaculty();
  const update = useUpdateFaculty();
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState<FacultyStatus>('ACTIVE');
  const [seeded, setSeeded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [designationPickerOpen, setDesignationPickerOpen] = useState(false);

  // Seed once from the loaded record. Guarded by `seeded` so a background refetch cannot overwrite
  // what the administrator is part-way through typing.
  if (isEdit && existing && !seeded) {
    setName(existing.name);
    setEmail(existing.email);
    setEmployeeId(existing.employeeId);
    setDesignation(existing.designation);
    setPhone(existing.phone ?? '');
    setDepartment(existing.department ?? '');
    setStatus(existing.status ?? 'ACTIVE');
    setSeeded(true);
  }

  const departmentOptions = useMemo(() => (settings?.departments?.length ? settings.departments : DEPARTMENTS).map((d) => ({ id: d, label: d, selected: d === department })), [department, settings]);
  const designationOptions = useMemo(() => (settings?.facultyRoles?.length ? settings.facultyRoles : DESIGNATIONS).map((d) => ({ id: d, label: d, selected: d === designation })), [designation, settings]);

  const submit = useCallback(async () => {
    setFieldErrors({});
    setBanner(null);

    try {
      if (isEdit && facultyId) {
        const saved = await update.mutateAsync({
          facultyId,
          name,
          email,
          department,
          designation,
          phone: phone.trim() || null,
          status,
        });
        toast.show({ message: `${saved.name} updated`, tone: 'success' });
      } else {
        const saved = await create.mutateAsync({
          name,
          email,
          employeeId,
          department,
          designation,
          phone: phone.trim() || null,
          status,
        });
        toast.show({ message: `${saved.name} added`, tone: 'success' });
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
    facultyId,
    name,
    email,
    employeeId,
    department,
    designation,
    phone,
    status,
    create,
    update,
    toast,
  ]);

  const title = isEdit ? 'Edit faculty' : 'Add faculty';

  return (
    <AdminScaffold
      active="faculty"
      title={title}
      subtitle={isEdit ? existing?.name : 'New faculty member'}
      breadcrumbs={[
        { label: 'Administration', href: '/(admin)/dashboard' },
        { label: 'Faculty', href: '/(admin)/faculty' },
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
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Dr. Anita Rao"
              icon="person"
              autoCapitalize="words"
              {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
            />
            <View style={styles.gap} />
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="anita.rao@institution.edu"
              keyboardType="email-address"
              autoCapitalize="none"
              {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
            />
            <View style={styles.gap} />
            <Input
              label="Employee ID"
              value={employeeId}
              onChangeText={setEmployeeId}
              placeholder="emp_20481"
              icon="faculty"
              autoCapitalize="none"
              // Immutable after creation: it identifies the person across every audit entry, so
              // changing it would orphan their history.
              editable={!isEdit}
              {...(isEdit ? { helperText: 'Employee ID cannot be changed.' } : {})}
              {...(fieldErrors.employeeId ? { error: fieldErrors.employeeId } : {})}
            />
            <View style={styles.gap} />
            <Input
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              keyboardType="phone-pad"
            />
          </Card>
        </View>

        <View style={styles.block}>
          <SectionHeader title="Role" divider />
          <Card>
            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurface}>Role / designation</Text>
              <Button label={designation || 'Select role'} icon="faculty" variant="secondary" fullWidth onPress={() => setDesignationPickerOpen(true)} />
              {fieldErrors.designation ? <Text variant="labelMd" color={palette.error}>{fieldErrors.designation}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurface}>Department</Text>
              <Button label={department || 'Select department'} variant="secondary" fullWidth onPress={() => setDepartmentPickerOpen(true)} />
              {fieldErrors.department ? <Text variant="labelMd" color={palette.error}>{fieldErrors.department}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.fieldLabel}>
                STATUS
              </Text>
              <FilterChips
                options={[
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'ON_LEAVE', label: 'On leave' },
                  { value: 'INACTIVE', label: 'Inactive' },
                ]}
                selected={status}
                onSelect={(value) => setStatus(value as FacultyStatus)}
                contentInset={0}
              />
              <Text variant="labelMd" color={palette.outline}>
                Inactive members keep their attendance history but cannot be assigned new classes.
              </Text>
            </View>
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
            label={isEdit ? 'Save changes' : 'Add faculty'}
            icon="check"
            onPress={() => void submit()}
            loading={pending}
            disabled={pending || (isEdit && loadingExisting)}
            style={styles.action}
          />
        </View>
      </Screen>
      <SelectionSheet visible={departmentPickerOpen} title="Choose department" options={departmentOptions} onSelect={(value) => { setDepartment(value); setDepartmentPickerOpen(false); }} onClose={() => setDepartmentPickerOpen(false)} searchable />
      <SelectionSheet visible={designationPickerOpen} title="Choose role / designation" options={designationOptions} onSelect={(value) => { setDesignation(value); setDesignationPickerOpen(false); }} onClose={() => setDesignationPickerOpen(false)} searchable />
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
  field: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    marginBottom: spacing.xs / 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  action: {
    flex: 1,
  },
});
