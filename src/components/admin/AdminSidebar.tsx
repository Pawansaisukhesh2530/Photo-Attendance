import { router } from 'expo-router';
import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/primitives/Icon';
import { GlassSurface } from '@/components/primitives/GlassSurface';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, touch } from '@/theme';
import { useAuthStore } from '@/store/authStore';

import { ADMIN_DESTINATIONS } from './adminNav';

export interface AdminSidebarProps {
  /** Route segment of the active destination, e.g. "faculty". */
  active: string;
  institutionName: string;
  institutionCode: string;
}

/** Fixed sidebar width. Wide enough for the longest label without crowding the content. */
export const ADMIN_SIDEBAR_WIDTH = 248;

const NavItem = memo(function NavItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      feedback="opacity"
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      // `accessibilityState.selected` covers native screen readers. On the web it lands as
      // `aria-selected`, which is ignored on a `role="link"`, so the active destination needs
      // `aria-current="page"` as well — verified in a browser, where the attribute was previously
      // absent and the active item was distinguishable only by colour.
      {...(active ? ({ 'aria-current': 'page' } as const) : {})}
      accessibilityLabel={label}
      style={[styles.item, active && styles.itemActive]}
    >
      {/*
        Active state carries four signals, not just colour: a filled surface, a left rail, the
        native `selected` state and `aria-current` on the web. Colour alone would fail for anyone
        who cannot distinguish the tint.
      */}
      <Icon name={icon} size={20} color={active ? palette.primary : palette.onSurfaceVariant} />
      <Text
        variant="bodyLg"
        color={active ? palette.primary : palette.onSurfaceVariant}
        numberOfLines={1}
        style={styles.itemLabel}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
});

/**
 * Persistent administrative sidebar. Desktop and large-tablet only.
 *
 * This is the pattern the Stitch desktop design uses and the one administrators expect from a
 * college portal: every destination visible at once, no hamburger, no hidden depth. It is rendered
 * only at the `expanded` size class — on a phone it would eat half the width, so `compact` and
 * `regular` use bottom tabs plus a More menu instead.
 *
 * Navigation uses `replace` rather than `push`. An admin console is a set of peer sections, not a
 * drill-down: pushing would build a back stack of sibling pages that nobody wants to walk back
 * through.
 */
export function AdminSidebar({ active, institutionName, institutionCode }: AdminSidebarProps) {
  const logout = useAuthStore((state) => state.logout);

  return (
    <View style={styles.sidebar}>
      <GlassSurface intensity={82} style={StyleSheet.absoluteFill} />
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Text variant="labelMd" color={palette.onPrimary}>
            {institutionCode.slice(0, 3).toUpperCase()}
          </Text>
        </View>
        <View style={styles.brandText}>
          <Text variant="titleLg" color={palette.onSurface} numberOfLines={2}>
            {institutionName}
          </Text>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Administration
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.nav}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        {ADMIN_DESTINATIONS.map((destination) => (
          <NavItem
            key={destination.segment}
            label={destination.label}
            icon={destination.icon}
            active={destination.segment === active}
            onPress={() => router.replace(destination.href as never)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text variant="labelMd" color={palette.outline}>
          EduTrace Pro
        </Text>
        <AnimatedPressable
          onPress={async () => {
            await logout();
            router.replace('/(auth)/login');
          }}
          feedback="opacity"
          accessibilityRole="button"
          accessibilityLabel="Log out"
          style={styles.logout}
        >
          <Icon name="logout" size={18} color={palette.onSurfaceVariant} />
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            Log out
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: ADMIN_SIDEBAR_WIDTH,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: '0 24px 70px rgba(0,0,0,0.32)',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: palette.outlineVariant,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  brandText: {
    flex: 1,
    gap: 2,
  },
  nav: {
    flex: 1,
  },
  navContent: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: touch.comfortable,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemActive: {
    backgroundColor: 'rgba(169,156,255,0.15)',
    borderColor: 'rgba(190,180,255,0.22)',
  },
  itemLabel: {
    flex: 1,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.outlineVariant,
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
