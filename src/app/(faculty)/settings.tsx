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
  type SelectionOption,
} from '@/components';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore, type MotionPreference } from '@/store/preferences';
import { palette, radius, spacing } from '@/theme';

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
              description="All data is stored by the attendance backend."
              value="Live API"
              divider
            />
            <SettingsRow
              icon="support"
              label="Support"
              description="Attendance questions and account access go through your institution's IT helpdesk. There is no in-app support channel in this build."
            />
          </Card>
        </View>

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
