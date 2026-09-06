import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  Badge,
  Button,
  Card,
  ConfirmationModal,
  ErrorState,
  Icon,
  Input,
  Screen,
  SectionHeader,
  SkeletonCard,
  Text,
  useToast,
} from '@/components';
import { useInstitutionSettings, useUpdateSettings } from '@/hooks/useSettings';
import { palette, radius, spacing, useResponsive } from '@/theme';
import { formatShortDate } from '@/utils/datetime';

/**
 * Institution settings.
 *
 * The attendance threshold is the reason this screen exists. It is institution policy, owned by the
 * server, and every surface that flags a student follows it — the reports read
 * `AttendanceReport.threshold`, the admin screens read these settings, and the
 * `ATTENDANCE_THRESHOLD` constant is only a client-side default for faculty screens that predate
 * the contract. Nothing here hard-codes 75.
 *
 * Changing it is consequential: it retroactively changes who counts as low-attendance across the
 * whole institution, so it asks for confirmation, states the effect, and is audited on its own as a
 * `SETTING_CHANGED` entry with before and after values.
 */
export default function AdminSettingsScreen() {
  const { isExpanded } = useResponsive();
  const toast = useToast();

  const { data: settings, isLoading, isRefetching, error, refetch } = useInstitutionSettings();
  const update = useUpdateSettings();

  const [thresholdText, setThresholdText] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [departmentsText, setDepartmentsText] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  if (settings && !seeded) {
    setThresholdText(String(settings.attendanceThreshold));
    setInstitutionName(settings.institutionName);
    setDepartmentsText(settings.departments.join(', '));
    setSeeded(true);
  }

  const parsedThreshold = Number(thresholdText);
  const thresholdChanged =
    settings !== undefined &&
    Number.isFinite(parsedThreshold) &&
    parsedThreshold !== settings.attendanceThreshold;
  const nameChanged = settings !== undefined && institutionName.trim() !== settings.institutionName;
  const departments = useMemo(() => departmentsText.split(',').map((value) => value.trim()).filter(Boolean), [departmentsText]);
  const departmentsChanged = settings !== undefined && departments.join('|') !== settings.departments.join('|');
  const dirty = thresholdChanged || nameChanged || departmentsChanged;

  const save = useCallback(async () => {
    setConfirming(false);
    setFieldErrors({});

    try {
      const saved = await update.mutateAsync({
        ...(thresholdChanged ? { attendanceThreshold: parsedThreshold } : {}),
        ...(nameChanged ? { institutionName: institutionName.trim() } : {}),
        ...(departmentsChanged ? { departments } : {}),
      });
      setThresholdText(String(saved.attendanceThreshold));
      setInstitutionName(saved.institutionName);
      setDepartmentsText(saved.departments.join(', '));
      toast.show({ message: 'Settings saved', tone: 'success' });
    } catch (e) {
      if (isApiError(e) && e.kind === 'VALIDATION' && e.fieldErrors) {
        setFieldErrors(e.fieldErrors);
        return;
      }
      toast.show({
        message: isApiError(e) ? e.message : 'Could not save settings.',
        tone: 'error',
      });
    }
  }, [thresholdChanged, nameChanged, departmentsChanged, departments, parsedThreshold, institutionName, update, toast]);

  const scaffold = {
    active: 'settings',
    title: 'Settings',
    subtitle: settings ? `${settings.institutionName} · ${settings.academicSession}` : 'Institution',
    breadcrumbs: [
      { label: 'Administration', href: '/(admin)/dashboard' },
      { label: 'Settings' },
    ],
    onBack: isExpanded ? undefined : () => router.back(),
    ...(settings
      ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
      : {}),
  };

  if (isLoading) {
    return (
      <AdminScaffold {...scaffold}>
        <Screen scrollable>
          <View style={styles.skeletons}>
            <SkeletonCard height={110} />
            <SkeletonCard height={170} />
            <SkeletonCard height={150} />
          </View>
        </Screen>
      </AdminScaffold>
    );
  }

  if (error || !settings) {
    return (
      <AdminScaffold {...scaffold}>
        <Screen>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </AdminScaffold>
    );
  }

  return (
    <AdminScaffold {...scaffold}>
      <Screen
        scrollable
        respectBottomInset={!isExpanded}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        contentContainerStyle={styles.content}
      >
        {/* Attendance policy */}
        <View style={styles.block}>
          <SectionHeader title="Attendance policy" divider />
          <Card>
            <View style={styles.currentRow}>
              <View style={styles.currentWell}>
                <Text variant="headlineSm" color={palette.primary}>
                  {settings.attendanceThreshold}%
                </Text>
              </View>
              <View style={styles.currentText}>
                <Text variant="bodyLg" color={palette.onSurface}>
                  Current threshold
                </Text>
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  Students below this are flagged across every report and directory.
                </Text>
              </View>
            </View>

            <View style={styles.gap} />

            <Input
              label="Attendance threshold (%)"
              value={thresholdText}
              onChangeText={setThresholdText}
              keyboardType="number-pad"
              icon="reports"
              helperText="Between 1 and 100. Applies institution-wide."
              {...(fieldErrors.attendanceThreshold
                ? { error: fieldErrors.attendanceThreshold }
                : {})}
            />

            {thresholdChanged ? (
              <View style={styles.impactNote}>
                <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} />
                <Text
                  variant="labelMd"
                  color={palette.onTertiaryFixedVariant}
                  style={styles.flex}
                >
                  Changing this from {settings.attendanceThreshold}% to {thresholdText}% immediately
                  changes which students are flagged everywhere. The change is recorded in the audit
                  log.
                </Text>
              </View>
            ) : null}
          </Card>
        </View>

        {/* Institution identity */}
        <View style={styles.block}>
          <SectionHeader title="Institution" divider />
          <Card>
            <Input
              label="Institution name"
              value={institutionName}
              onChangeText={setInstitutionName}
              icon="institution"
              {...(fieldErrors.institutionName ? { error: fieldErrors.institutionName } : {})}
            />
            <View style={styles.gap} />
            <Input
              label="Departments"
              value={departmentsText}
              onChangeText={setDepartmentsText}
              placeholder="CSE, ECE, IT"
              helperText="Enter comma-separated department names. These values drive all department dropdowns."
            />
            <View style={styles.gap} />
            <View style={styles.readOnlyRow}>
              <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flex}>
                Short code
              </Text>
              <Badge label={settings.institutionCode} />
            </View>
            <View style={styles.readOnlyRow}>
              <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flex}>
                Academic session
              </Text>
              <Badge label={settings.academicSession} icon="calendar" />
            </View>
          </Card>
        </View>

        {/* Academic configuration — read-only, because these shape existing data. */}
        <View style={styles.block}>
          <SectionHeader title="Academic configuration" divider />
          <Card>
            <View style={styles.readOnlyRow}>
              <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flex}>
                Semesters
              </Text>
              <Text variant="bodyLg" color={palette.onSurface}>
                {settings.semesterCount}
              </Text>
            </View>

            <View style={styles.deptBlock}>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Departments
              </Text>
              <View style={styles.deptTags}>
                {settings.departments.map((d) => (
                  <Badge key={d} label={d} icon="institution" />
                ))}
              </View>
            </View>

            <Text variant="labelMd" color={palette.outline} style={styles.note}>
              Departments and semester count are read-only here. Both are referenced by existing
              classes, students and reports, so changing them needs a migration the backend has to
              own rather than an in-place edit.
            </Text>
          </Card>
        </View>

        {/* Attendance rules — reported, not configurable. */}
        <View style={styles.block}>
          <SectionHeader title="Attendance rules" divider />
          <Card>
            <View style={styles.readOnlyRow}>
              <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flex}>
                Post-finalization edits
              </Text>
              <Badge
                label={settings.allowPostFinalizationEdits ? 'Allowed' : 'Blocked'}
                icon={settings.allowPostFinalizationEdits ? 'present' : 'lock'}
                background={
                  settings.allowPostFinalizationEdits
                    ? palette.secondaryContainer
                    : palette.surfaceContainerHigh
                }
                foreground={
                  settings.allowPostFinalizationEdits
                    ? palette.onSecondaryContainer
                    : palette.onSurfaceVariant
                }
                border={
                  settings.allowPostFinalizationEdits
                    ? palette.secondaryContainer
                    : palette.outlineVariant
                }
              />
            </View>

            <Text variant="labelMd" color={palette.outline} style={styles.note}>
              Shown as status rather than a switch. Finalization does not lock attendance, and every
              amendment is audited — turning that off would change agreed attendance behaviour, so
              it is not something this screen offers.
            </Text>
          </Card>
        </View>

        {/* Provenance */}
        {settings.updatedAt ? (
          <View style={styles.block}>
            <Card>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                Last changed {formatShortDate(settings.updatedAt)}
                {settings.updatedByName ? ` by ${settings.updatedByName}` : ''}
              </Text>
            </Card>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Discard changes"
            variant="secondary"
            onPress={() => {
              setThresholdText(String(settings.attendanceThreshold));
              setInstitutionName(settings.institutionName);
              setFieldErrors({});
            }}
            disabled={!dirty || update.isPending}
            style={styles.action}
          />
          <Button
            label="Save settings"
            icon="check"
            onPress={() => setConfirming(true)}
            loading={update.isPending}
            disabled={!dirty || update.isPending}
            style={styles.action}
          />
        </View>
      </Screen>

      <ConfirmationModal
        visible={confirming}
        tone={thresholdChanged ? 'danger' : 'default'}
        icon={thresholdChanged ? 'warning' : 'settings'}
        title={thresholdChanged ? 'Change the attendance threshold?' : 'Save settings?'}
        message={
          thresholdChanged
            ? `Moving the threshold from ${settings.attendanceThreshold}% to ${thresholdText}% changes which students are flagged as low-attendance across every class and report, immediately. The change is recorded in the audit log.`
            : 'Institution settings will be updated.'
        }
        confirmLabel="Save"
        onConfirm={() => void save()}
        onCancel={() => setConfirming(false)}
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  skeletons: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  block: {
    marginTop: spacing.md,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  currentWell: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryFixed,
  },
  currentText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  gap: {
    height: spacing.md,
  },
  impactNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.tertiaryFixed,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.tertiaryFixedDim,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  deptBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  deptTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  note: {
    marginTop: spacing.sm,
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
