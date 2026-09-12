import { router } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { useAcademicTree } from '@/hooks/useAcademic';
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
  const academic = useAcademicTree();
  const update = useUpdateSettings();

  const [thresholdText, setThresholdText] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [institutionCode, setInstitutionCode] = useState('');
  const [academicSession, setAcademicSession] = useState('');
  const [semesterCount, setSemesterCount] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState('');
  const [classTypes, setClassTypes] = useState<string[]>([]);
  const [newClassType, setNewClassType] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  if (settings && !seeded) {
    setThresholdText(String(settings.attendanceThreshold));
    setInstitutionName(settings.institutionName);
    setInstitutionCode(settings.institutionCode);
    setAcademicSession(settings.academicSession);
    setSemesterCount(String(settings.semesterCount));
    setRoles(settings.facultyRoles);
    setClassTypes(settings.classTypes);
    setSeeded(true);
  }

  const parsedThreshold = Number(thresholdText);
  const thresholdChanged =
    settings !== undefined &&
    Number.isFinite(parsedThreshold) &&
    parsedThreshold !== settings.attendanceThreshold;
  const nameChanged = settings !== undefined && institutionName.trim() !== settings.institutionName;
  const codeChanged = settings !== undefined && institutionCode.trim().toUpperCase() !== settings.institutionCode;
  const rolesChanged = settings !== undefined && roles.join('|') !== settings.facultyRoles.join('|');
  const classTypesChanged = settings !== undefined && classTypes.join('|') !== settings.classTypes.join('|');
  const sessionChanged = settings !== undefined && academicSession.trim() !== settings.academicSession;
  const parsedSemesterCount = Number(semesterCount);
  const semesterCountChanged = settings !== undefined && semesterCount.trim() !== String(settings.semesterCount);
  const dirty = thresholdChanged || nameChanged || codeChanged || rolesChanged || classTypesChanged || sessionChanged || semesterCountChanged;

  const save = useCallback(async () => {
    setConfirming(false);
    setFieldErrors({});

    if (sessionChanged && academicSession.trim().length < 4) {
      setFieldErrors({ academicSession: 'Enter a valid academic session.' });
      return;
    }
    if (semesterCountChanged && (!Number.isInteger(parsedSemesterCount) || parsedSemesterCount < 1 || parsedSemesterCount > 20)) {
      setFieldErrors({ semesterCount: 'Enter a whole number from 1 to 20.' });
      return;
    }

    try {
      const saved = await update.mutateAsync({
        ...(thresholdChanged ? { attendanceThreshold: parsedThreshold } : {}),
        ...(nameChanged ? { institutionName: institutionName.trim() } : {}),
        ...(codeChanged ? { institutionCode: institutionCode.trim().toUpperCase() } : {}),
        ...(rolesChanged ? { facultyRoles: roles } : {}),
        ...(classTypesChanged ? { classTypes } : {}),
        ...(sessionChanged ? { academicSession: academicSession.trim() } : {}),
        ...(semesterCountChanged ? { semesterCount: parsedSemesterCount } : {}),
      });
      setThresholdText(String(saved.attendanceThreshold));
      setInstitutionName(saved.institutionName);
      setInstitutionCode(saved.institutionCode);
      setRoles(saved.facultyRoles);
      setClassTypes(saved.classTypes);
      setAcademicSession(saved.academicSession);
      setSemesterCount(String(saved.semesterCount));
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
  }, [thresholdChanged, nameChanged, codeChanged, rolesChanged, classTypesChanged, sessionChanged, semesterCountChanged, roles, classTypes, academicSession, parsedSemesterCount, parsedThreshold, institutionName, institutionCode, update, toast]);

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
              label="Institution short code"
              value={institutionCode}
              onChangeText={setInstitutionCode}
              placeholder="EDU"
              autoCapitalize="characters"
              helperText="2–20 letters, numbers, hyphens or underscores. Used in compact headers."
              {...(fieldErrors.institutionCode ? { error: fieldErrors.institutionCode } : {})}
            />
            <View style={styles.gap} />
            <Text variant="labelMd" color={palette.onSurface}>Faculty designations</Text>
            <View style={styles.optionList}>{roles.map((role)=><View key={role} style={styles.optionRow}><Text color={palette.onSurface} style={styles.flex}>{role}</Text><Button label="Remove" size="sm" variant="ghost" disabled={roles.length===1} onPress={()=>setRoles((current)=>current.filter((value)=>value!==role))}/></View>)}</View>
            <View style={styles.addRow}><View style={styles.flex}><Input label="New designation" value={newRole} onChangeText={setNewRole} placeholder="Assistant Professor" /></View><Button label="Add" icon="add" variant="secondary" disabled={!newRole.trim()||roles.some((role)=>role.toLowerCase()===newRole.trim().toLowerCase())} onPress={()=>{setRoles((current)=>[...current,newRole.trim()]);setNewRole('');}} /></View>
            <View style={styles.gap} />
            <Text variant="labelMd" color={palette.onSurface}>Class types</Text>
            <View style={styles.optionList}>{classTypes.map((classType)=><View key={classType} style={styles.optionRow}><Text color={palette.onSurface} style={styles.flex}>{classType}</Text><Button label="Remove" size="sm" variant="ghost" disabled={classTypes.length===1} onPress={()=>setClassTypes((current)=>current.filter((value)=>value!==classType))}/></View>)}</View>
            <View style={styles.addRow}><View style={styles.flex}><Input label="New class type" value={newClassType} onChangeText={setNewClassType} placeholder="Seminar" /></View><Button label="Add" icon="add" variant="secondary" disabled={!newClassType.trim()||classTypes.some((value)=>value.toLowerCase()===newClassType.trim().toLowerCase())} onPress={()=>{setClassTypes((current)=>[...current,newClassType.trim()]);setNewClassType('');}} /></View>
            <View style={styles.gap} />
            <Input
              label="Academic session"
              value={academicSession}
              onChangeText={setAcademicSession}
              icon="calendar"
              placeholder="2026-27"
              helperText="Used as the default session when creating a class."
              {...(fieldErrors.academicSession ? { error: fieldErrors.academicSession } : {})}
            />
          </Card>
        </View>

        {/* Academic configuration — read-only, because these shape existing data. */}
        <View style={styles.block}>
          <SectionHeader title="Academic configuration" divider />
          <Card>
            <Input
              label="Number of semesters"
              value={semesterCount}
              onChangeText={setSemesterCount}
              keyboardType="number-pad"
              helperText="Between 1 and 20. Controls semester choices in academic forms."
              {...(fieldErrors.semesterCount ? { error: fieldErrors.semesterCount } : {})}
            />

            <View style={styles.deptBlock}>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Departments
              </Text>
              <View style={styles.deptTags}>
                {(academic.data?.departments ?? [])
                  .filter((department) => department.active)
                  .map((department) => (
                    <Badge
                      key={department.id}
                      label={`${department.code} · ${department.name}`}
                      icon="institution"
                    />
                  ))}
              </View>
            </View>

            <Text variant="labelMd" color={palette.outline} style={styles.note}>
              Schools, departments, programmes, batches and sections are managed as linked records.
              Archived records remain available for historical data but disappear from new-record
              dropdowns.
            </Text>
            <View style={styles.gap} />
            <Button
              label="Manage academic structure"
              icon="institution"
              variant="secondary"
              onPress={() => router.push('/(admin)/academic-structure')}
            />
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
              setInstitutionCode(settings.institutionCode);
              setRoles(settings.facultyRoles);
              setClassTypes(settings.classTypes);
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
  optionList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  optionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainerHigh,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
