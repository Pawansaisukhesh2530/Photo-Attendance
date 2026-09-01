import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmationModal,
  Icon,
  Screen,
  SectionHeader,
  SelectionSheet,
  SettingsRow,
  Text,
  useToast,
  type SelectionOption,
} from '@/components';
import { USE_MOCK_API } from '@/constants/config';
import { clearAllFailures, clearFailure, forceFailure } from '@/mocks/latency';
import {
  getProcessingScenario,
  setProcessingScenario,
  type ProcessingScenario,
} from '@/mocks/mockAiProcessing';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore, type MotionPreference } from '@/store/preferences';
import { palette, radius, spacing } from '@/theme';
import type { ApiErrorKind } from '@/types';

/* ------------------------------------------------------------------ *
 * Motion preference presentation
 * ------------------------------------------------------------------ */

const MOTION_LABEL: Record<MotionPreference, string> = {
  SYSTEM: 'System default',
  REDUCED: 'Reduced motion',
  STANDARD: 'Standard motion',
};

const MOTION_DESCRIPTION: Record<MotionPreference, string> = {
  SYSTEM: 'Follows the reduce-motion setting on this device.',
  REDUCED: 'Animations finish instantly, whatever the device is set to.',
  STANDARD: 'Full animation, even if this device asks apps to reduce motion.',
};

const MOTION_ORDER: readonly MotionPreference[] = ['SYSTEM', 'REDUCED', 'STANDARD'];

/* ------------------------------------------------------------------ *
 * Development-only mock controls
 *
 * Everything in this block is gated on `__DEV__` at the call site. Metro substitutes `false` for
 * `__DEV__` in a production bundle, so the branch is dead code there and the panel cannot render.
 * The gate is deliberately NOT the user's role: FACULTY is not a trust boundary, and
 * `USE_MOCK_API` is a public `EXPO_PUBLIC_*` value that anyone holding the binary can read.
 * ------------------------------------------------------------------ */

/**
 * Every mock operation that consults the forced-failure switchboard.
 *
 * Transcribed from the `mockRequest` / `assertNoForcedFailure` call sites in `mocks/services.ts`.
 * Only these are listed: the mutations delay without checking the switchboard, so offering them
 * would be a control that silently does nothing.
 */
const FAILABLE_OPERATIONS: readonly string[] = [
  'attendance.captureAttendance',
  'attendance.getAttendanceHistory',
  'attendance.getAttendanceSession',
  'attendance.getPagedAttendanceHistory',
  'attendance.getTwinReviews',
  'audit.getAuditEntries',
  'audit.getPagedAuditEntries',
  'auth.getCurrentUser',
  'classes.getClass',
  'classes.getClasses',
  'classes.getPagedClasses',
  'classes.getTodayClasses',
  'faculty.getFacultyList',
  'faculty.getFacultyMember',
  'reports.getReport',
  'reports.getStudentStats',
  'settings.getInstitutionSettings',
  'students.getStudent',
  'students.getStudents',
];

/** `ApiErrorKind`, in the order `types/common.ts` declares it. */
const FAILURE_KINDS: readonly ApiErrorKind[] = [
  'NETWORK',
  'TIMEOUT',
  'OFFLINE',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'SERVER',
  'UPLOAD_INTERRUPTED',
  'UNKNOWN',
];

const SCENARIO_LABEL: Record<ProcessingScenario, string> = {
  SUCCESS: 'Success',
  NO_FACES_DETECTED: 'No faces detected',
  NO_RECOGNIZABLE_STUDENTS: 'No recognizable students',
  POOR_IMAGE_QUALITY: 'Poor image quality',
  PROCESSING_FAILURE: 'Processing failure',
  TIMEOUT: 'Timeout',
};

const SCENARIO_ORDER: readonly ProcessingScenario[] = [
  'SUCCESS',
  'NO_FACES_DETECTED',
  'NO_RECOGNIZABLE_STUDENTS',
  'POOR_IMAGE_QUALITY',
  'PROCESSING_FAILURE',
  'TIMEOUT',
];

/**
 * Display mirror of the forced-failure map.
 *
 * `latency.ts` keeps the authoritative map private and exposes no getter, and it is not being
 * changed to add one — the debug panel is not a reason to widen mock infrastructure. So this
 * records what the panel asked for, purely so the list survives navigating away and back. Module
 * scope rather than component state for that same reason. `clearAllFailures()` remains
 * authoritative; this set is cleared alongside it.
 */
const forcedFailureMirror = new Map<string, ApiErrorKind>();

type DebugSheet = 'none' | 'scenario' | 'operation' | 'kind';

function DebugPanel() {
  const toast = useToast();

  const [sheet, setSheet] = useState<DebugSheet>('none');
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ProcessingScenario>(() => getProcessingScenario());
  // Snapshot of the mirror, so state changes drive a re-render.
  const [active, setActive] = useState<[string, ApiErrorKind][]>(() => [
    ...forcedFailureMirror.entries(),
  ]);

  const syncActive = (): void => setActive([...forcedFailureMirror.entries()]);

  const chooseScenario = (value: string): void => {
    const next = SCENARIO_ORDER.find((candidate) => candidate === value);
    if (!next) return;
    setProcessingScenario(next);
    setScenario(next);
    setSheet('none');
    toast.show({
      message: `Processing scenario: ${SCENARIO_LABEL[next]}`,
      tone: next === 'SUCCESS' ? 'info' : 'error',
    });
  };

  const chooseKind = (value: string): void => {
    const kind = FAILURE_KINDS.find((candidate) => candidate === value);
    const operation = pendingOperation;
    if (!kind || operation === null) return;

    forceFailure(operation, kind);
    forcedFailureMirror.set(operation, kind);
    syncActive();
    setPendingOperation(null);
    setSheet('none');
    toast.show({ message: `${operation} will fail with ${kind}`, tone: 'error' });
  };

  const clearOne = (operation: string): void => {
    clearFailure(operation);
    forcedFailureMirror.delete(operation);
    syncActive();
    toast.show({ message: `Cleared ${operation}`, tone: 'info' });
  };

  const clearEverything = (): void => {
    clearAllFailures();
    forcedFailureMirror.clear();
    syncActive();
    // The scripted recognition outcome is a separate switch in a separate module, so "clear
    // everything" has to reset it too or a forced processing failure would survive the reset.
    setProcessingScenario('SUCCESS');
    setScenario('SUCCESS');
    toast.show({ message: 'All forced failures cleared', tone: 'info' });
  };

  const scenarioOptions: SelectionOption[] = SCENARIO_ORDER.map((value) => ({
    id: value,
    label: SCENARIO_LABEL[value],
    selected: value === scenario,
    ...(value === 'SUCCESS' ? { description: 'Normal path — no failure injected' } : {}),
  }));

  const operationOptions: SelectionOption[] = FAILABLE_OPERATIONS.map((operation) => ({
    id: operation,
    label: operation,
    ...(forcedFailureMirror.has(operation)
      ? { description: `Currently forced: ${forcedFailureMirror.get(operation) ?? ''}` }
      : {}),
    selected: forcedFailureMirror.has(operation),
  }));

  const kindOptions: SelectionOption[] = FAILURE_KINDS.map((kind) => ({
    id: kind,
    label: kind,
  }));

  return (
    <View style={styles.block}>
      <SectionHeader title="Developer tools" divider />

      <Card accentColor={palette.error}>
        <View style={styles.debugHeader}>
          <Icon name="warning" size={20} color={palette.error} />
          <View style={styles.flex}>
            <View style={styles.debugTitleRow}>
              <Text variant="titleLg" color={palette.error}>
                Development build only
              </Text>
              <Badge
                label="DEBUG"
                icon="warning"
                background={palette.errorContainer}
                foreground={palette.onErrorContainer}
                border={palette.error}
              />
            </View>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              These controls make the mock data layer fail on purpose, so error states can be seen
              without waiting for a real outage. They are compiled out of release builds and are not
              part of the product. Nothing here touches attendance records.
            </Text>
          </View>
        </View>

        {!USE_MOCK_API ? (
          <View style={styles.debugNote}>
            <Icon name="info" size={16} color={palette.onTertiaryFixedVariant} />
            <Text variant="labelMd" color={palette.onTertiaryFixedVariant} style={styles.flex}>
              The app is pointed at a real API right now, so these switches have nothing to act on.
              They only affect the mock service layer.
            </Text>
          </View>
        ) : null}
      </Card>

      <View style={styles.cardGap} />

      <Card padded={false}>
        <SettingsRow
          icon="processing"
          label="Recognition outcome"
          description="Which scripted result the mock pipeline produces on the next capture."
          value={SCENARIO_LABEL[scenario]}
          onPress={() => setSheet('scenario')}
          accessibilityLabel={`Recognition outcome, currently ${SCENARIO_LABEL[scenario]}`}
          accessibilityHint="Opens the list of scripted outcomes"
          divider
        />
        <SettingsRow
          icon="error"
          label="Force an operation to fail"
          description="Pick a mock operation and the error it should raise."
          onPress={() => setSheet('operation')}
          accessibilityHint="Opens the list of mock operations"
        />
      </Card>

      {active.length > 0 ? (
        <>
          <View style={styles.cardGap} />
          <Card padded={false}>
            {active.map(([operation, kind], index) => (
              <SettingsRow
                key={operation}
                label={operation}
                description={`Fails with ${kind}`}
                divider={index < active.length - 1}
                control={
                  <Button
                    label="Clear"
                    variant="secondary"
                    size="sm"
                    onPress={() => clearOne(operation)}
                  />
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      <Button
        label="Clear all forced failures"
        variant="secondary"
        icon="retry"
        fullWidth
        onPress={clearEverything}
        style={styles.debugReset}
      />

      <SelectionSheet
        visible={sheet === 'scenario'}
        title="Recognition outcome"
        subtitle="Applies to the next capture. Mock only."
        options={scenarioOptions}
        onSelect={chooseScenario}
        onClose={() => setSheet('none')}
      />

      <SelectionSheet
        visible={sheet === 'operation'}
        title="Force a failure"
        subtitle="Choose the mock operation to break."
        options={operationOptions}
        searchable
        searchPlaceholder="Search operations"
        onSelect={(id) => {
          setPendingOperation(id);
          setSheet('kind');
        }}
        onClose={() => setSheet('none')}
      />

      <SelectionSheet
        visible={sheet === 'kind'}
        title="Error kind"
        subtitle={pendingOperation ?? undefined}
        options={kindOptions}
        onSelect={chooseKind}
        onClose={() => {
          setPendingOperation(null);
          setSheet('none');
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

/**
 * Faculty settings.
 *
 * Preferences here are device-local by design — see `store/preferences.ts`. Nothing on this screen
 * writes to the institution's records, and nothing on it is institution policy: the attendance
 * threshold, departments and academic session all belong to the admin settings screen, which is
 * server-owned and audits every change.
 *
 * Two sections state a limitation rather than offering a control, which is the honest thing to do
 * for a build with no backend behind it. Notifications do not exist in this app at all, so the
 * section says so instead of presenting toggles that would store a value nothing reads. And the
 * developer tools only appear in a development build.
 */
export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const motion = usePreferencesStore((state) => state.motion);
  const setMotion = usePreferencesStore((state) => state.setMotion);
  const showFramingGuide = usePreferencesStore((state) => state.showCameraFramingGuide);
  const setShowFramingGuide = usePreferencesStore((state) => state.setShowCameraFramingGuide);

  const [confirming, setConfirming] = useState(false);
  const [motionSheet, setMotionSheet] = useState(false);

  const handleSignOut = async (): Promise<void> => {
    setConfirming(false);
    await logout();
    router.replace('/(auth)/login');
  };

  /*
    App identity from `expo-constants` rather than a literal.

    A hard-coded version string is wrong the moment `app.json` changes and nobody notices, and a
    support conversation that starts from the wrong version number wastes everyone's time. The
    fallbacks cover a manifest that failed to load rather than papering over a missing value.
  */
  const appName = Constants.expoConfig?.name ?? 'EduTrace Pro';
  const appVersion = Constants.expoConfig?.version ?? 'Unknown';

  const motionOptions: SelectionOption[] = MOTION_ORDER.map((value) => ({
    id: value,
    label: MOTION_LABEL[value],
    description: MOTION_DESCRIPTION[value],
    selected: value === motion,
  }));

  const chooseMotion = (value: string): void => {
    const next = MOTION_ORDER.find((candidate) => candidate === value);
    if (!next) return;
    setMotion(next);
    setMotionSheet(false);
  };

  return (
    <>
      <AppHeader title="Settings" onBack={() => router.back()} />
      <Screen scrollable respectBottomInset={false} contentContainerStyle={styles.content}>
        {user ? (
          <Card style={styles.profile}>
            <View style={styles.profileRow}>
              <Avatar name={user.name} uri={user.avatarUrl} size={56} />
              <View style={styles.profileText}>
                <Text variant="titleLg" color={palette.onSurface} numberOfLines={1}>
                  {user.name}
                </Text>
                <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                  {user.email}
                </Text>
                <Text variant="labelMd" color={palette.primary}>
                  {user.role === 'ADMIN' ? 'Administrator' : 'Faculty'}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* ---------------------------------------------------------- *
         * Notifications — deliberately not a control.
         *
         * There is no notification system in this app: no scheduling, no push registration, no
         * permission request, no in-app notification surface. A switch here would store a value
         * nothing reads and imply reminders that will never arrive, so the section reports the
         * absence instead. It contains no interactive elements at all.
         * ---------------------------------------------------------- */}
        <View style={styles.block}>
          <SectionHeader title="Notifications" divider />
          <Card>
            <View style={styles.unavailableRow}>
              <View style={styles.mutedWell}>
                <Icon name="notifications" size={18} color={palette.onSurfaceVariant} />
              </View>
              <View style={styles.flex}>
                <View style={styles.unavailableTitleRow}>
                  <Text variant="bodyLg" color={palette.onSurface}>
                    Notification preferences
                  </Text>
                  <Badge
                    label="Not available"
                    background={palette.surfaceContainerHigh}
                    foreground={palette.onSurfaceVariant}
                    border={palette.outlineVariant}
                  />
                </View>
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  This build has no notification system, so there is nothing to configure yet.
                  Reminders, push alerts and scheduled summaries are not implemented, not scheduled
                  and never sent. No preference is stored for them.
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* ---------------------------------------------------------- *
         * Camera
         * ---------------------------------------------------------- */}
        <View style={styles.block}>
          <SectionHeader title="Camera" divider />
          <Card padded={false}>
            <SettingsRow
              icon="focus"
              label="Framing guide"
              description="Corner brackets and a rule-of-thirds grid over the viewfinder. Drawing aid only — the camera does not analyse the picture either way."
              control={
                <Checkbox
                  checked={showFramingGuide}
                  onChange={setShowFramingGuide}
                  accessibilityLabel="Framing guide"
                />
              }
            />
          </Card>
          <Text variant="labelMd" color={palette.outline} style={styles.note}>
            Applies the next time the camera opens. Everything else about capture is unchanged:
            still one photograph, still the rear camera, still no face detection on the device.
          </Text>
        </View>

        {/* ---------------------------------------------------------- *
         * Accessibility
         * ---------------------------------------------------------- */}
        <View style={styles.block}>
          <SectionHeader title="Accessibility" divider />
          <Card padded={false}>
            <SettingsRow
              icon="processing"
              label="Motion"
              description={MOTION_DESCRIPTION[motion]}
              value={MOTION_LABEL[motion]}
              onPress={() => setMotionSheet(true)}
              accessibilityLabel={`Motion, currently ${MOTION_LABEL[motion]}`}
              accessibilityHint="Opens the motion options"
            />
          </Card>
          <Text variant="labelMd" color={palette.outline} style={styles.note}>
            Reduced motion finishes every animation in a single frame rather than removing it, so
            nothing moves but nothing is lost. Selection, errors, loading and success are always
            carried by text, colour and iconography as well, never by movement alone.
          </Text>
        </View>

        {/* ---------------------------------------------------------- *
         * About & Support
         * ---------------------------------------------------------- */}
        <View style={styles.block}>
          <SectionHeader title="About & Support" divider />
          <Card padded={false}>
            <SettingsRow label="Application" value={appName} divider />
            <SettingsRow label="Version" value={appVersion} divider />
            <SettingsRow
              label="Data"
              description={
                USE_MOCK_API
                  ? 'Mock services. Attendance you record is held in memory for this session and is gone when the app restarts.'
                  : 'Connected to the attendance API.'
              }
              value={USE_MOCK_API ? 'Mock data' : 'Live API'}
              divider
            />
            <SettingsRow
              icon="support"
              label="Support"
              description="Attendance questions and account access go through your institution's IT helpdesk. There is no in-app support channel in this build."
            />
          </Card>
        </View>

        {/* Development-only. Compiled out of release builds. */}
        {__DEV__ ? <DebugPanel /> : null}

        <Button
          label="Sign out"
          variant="secondary"
          icon="logout"
          fullWidth
          onPress={() => setConfirming(true)}
          style={styles.signOut}
        />
      </Screen>

      <SelectionSheet
        visible={motionSheet}
        title="Motion"
        subtitle="How much the interface animates."
        options={motionOptions}
        onSelect={chooseMotion}
        onClose={() => setMotionSheet(false)}
      />

      <ConfirmationModal
        visible={confirming}
        tone="danger"
        icon="logout"
        title="Sign out?"
        message="You will need to sign in again to record attendance. Your settings on this device are cleared."
        confirmLabel="Sign out"
        onConfirm={() => void handleSignOut()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  profile: {
    marginTop: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  block: {
    marginTop: spacing.lg,
  },
  cardGap: {
    height: spacing.sm,
  },
  note: {
    marginTop: spacing.sm,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  unavailableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
  },
  unavailableTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  mutedWell: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainerHigh,
  },
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
  },
  debugTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  debugNote: {
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
  debugReset: {
    marginTop: spacing.md,
  },
  signOut: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});
