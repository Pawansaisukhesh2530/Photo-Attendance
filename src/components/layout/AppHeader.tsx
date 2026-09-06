import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/primitives/Icon';
import { GlassSurface } from '@/components/primitives/GlassSurface';
import { Text } from '@/components/primitives/Text';
import { palette, spacing, touch } from '@/theme';

export interface HeaderAction {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Renders a small dot on the glyph, for unread notifications. */
  badged?: boolean;
}

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: HeaderAction[];
  /** Transparent over a camera preview or photo viewer. */
  transparent?: boolean;
  /** Centres the title, iOS-style. Left-aligned by default, matching Stitch. */
  centerTitle?: boolean;
}

/**
 * Top app bar.
 *
 * Condensed from the Stitch `TopNavBar`, which carries brand, a global search field,
 * notifications, help, a "Faculty View" toggle and an avatar across a 2560px canvas.
 * None of that fits a phone, so this keeps the contextual essentials — back, title,
 * subtitle, at most two actions — and the discarded items move elsewhere: search
 * becomes an in-content field on list screens, and profile/notifications live in the
 * Settings tab.
 *
 * The header owns the top safe-area inset so its background extends behind the status
 * bar, which is why `Screen` does not apply it.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  actions = [],
  transparent = false,
  centerTitle = false,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: 'transparent',
          borderBottomWidth: transparent ? 0 : StyleSheet.hairlineWidth * 2,
        },
      ]}
    >
      {!transparent ? <GlassSurface intensity={78} style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon
              name="back"
              size={24}
              color={transparent ? palette.surfaceContainerLowest : palette.onSurfaceVariant}
            />
          </Pressable>
        ) : null}

        <View style={[styles.titleBlock, centerTitle && styles.titleCentered]}>
          <Text
            variant="titleLg"
            color={transparent ? palette.surfaceContainerLowest : palette.primary}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              variant="labelMd"
              color={transparent ? palette.surfaceContainerLowest : palette.onSurfaceVariant}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {actions.map((action) => (
          <Pressable
            key={action.accessibilityLabel}
            onPress={action.onPress}
            hitSlop={8}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
          >
            <Icon
              name={action.icon}
              size={24}
              color={transparent ? palette.surfaceContainerLowest : palette.onSurfaceVariant}
            />
            {action.badged ? <View style={styles.badge} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomColor: palette.outlineVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  iconButton: {
    width: touch.comfortable,
    height: touch.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  titleCentered: {
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.error,
    borderWidth: 1,
    borderColor: palette.surface,
  },
});
