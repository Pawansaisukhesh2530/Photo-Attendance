import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ADMIN_SECONDARY,
  AdminScaffold,
  Button,
  Card,
  ConfirmationModal,
  Icon,
  AnimatedPressable,
  Screen,
  SectionHeader,
  Text,
} from '@/components';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { useAuthStore } from '@/store/authStore';
import { palette, radius, spacing, touch } from '@/theme';

/**
 * The "More" tab. Phone and small-tablet only.
 *
 * Holds the four destinations that do not earn a bottom tab, plus sign-out. On desktop this route
 * is unreachable through the sidebar because all eight destinations are already visible there —
 * it stays registered so a deep link never 404s.
 *
 * Deliberately a plain list rather than a bottom sheet: these are navigation destinations, and a
 * sheet would add a dismissal gesture between the user and a page they asked for.
 */
export default function AdminMoreScreen() {
  const { data: settings } = useInstitutionSettings();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [confirming, setConfirming] = useState(false);

  const handleSignOut = async (): Promise<void> => {
    setConfirming(false);
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <AdminScaffold
      active="more"
      title="More"
      subtitle={settings?.institutionName ?? 'Administration'}
      {...(settings
        ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode }
        : {})}
    >
      <Screen scrollable respectBottomInset={false}>
        <View style={styles.block}>
          <SectionHeader title="Administration" divider />
          <Card padded={false}>
            {ADMIN_SECONDARY.map((destination, index) => (
              <AnimatedPressable
                key={destination.segment}
                onPress={() => router.push(destination.href as never)}
                feedback="opacity"
                accessibilityRole="link"
                accessibilityLabel={`${destination.label}. ${destination.description}`}
                style={[
                  styles.row,
                  index < ADMIN_SECONDARY.length - 1 && styles.divider,
                ]}
              >
                <View style={styles.well}>
                  <Icon name={destination.icon} size={20} color={palette.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyLg" color={palette.onSurface}>
                    {destination.label}
                  </Text>
                  <Text variant="labelMd" color={palette.onSurfaceVariant}>
                    {destination.description}
                  </Text>
                </View>
                <Icon name="chevronRight" size={20} color={palette.outline} />
              </AnimatedPressable>
            ))}
          </Card>
        </View>

        <View style={styles.block}>
          <SectionHeader title="Signed in as" divider />
          <Card>
            <Text variant="bodyLg" color={palette.onSurface}>
              {user?.name ?? 'Administrator'}
            </Text>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              {user?.email ?? ''}
            </Text>
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

      <ConfirmationModal
        visible={confirming}
        tone="danger"
        icon="logout"
        title="Sign out?"
        message="You will need to sign in again."
        confirmLabel="Sign out"
        onConfirm={() => void handleSignOut()}
        onCancel={() => setConfirming(false)}
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: touch.large,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  well: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryFixed,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  signOut: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
});
