import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, touch } from '@/theme';

interface SettingsRowBase {
  label: string;
  /** Secondary line under the label. Use it to say what the setting actually does. */
  description?: string;
  icon?: IconName;
  /** Trailing static text — a version number, or the currently chosen option. */
  value?: string;
  /** Hairline beneath the row. Omit on the last row of a card. */
  divider?: boolean;
  testID?: string;
}

/**
 * A row that is itself the control. Opens a picker, or navigates.
 *
 * `control` is typed `never` here: see the note on the component.
 */
interface PressableSettingsRow extends SettingsRowBase {
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  control?: never;
}

/**
 * An inert row that may hold one control, such as a `Checkbox`.
 *
 * `onPress` is typed `never` here: see the note on the component.
 */
interface StaticSettingsRow extends SettingsRowBase {
  control?: ReactNode;
  onPress?: never;
  accessibilityLabel?: never;
  accessibilityHint?: never;
}

export type SettingsRowProps = PressableSettingsRow | StaticSettingsRow;

/**
 * One row in a settings card.
 *
 * ============================================================================
 * The union type is the point of this component, not an inconvenience.
 *
 * `onPress` and `control` are mutually exclusive at the type level, so a row can be a control or
 * contain a control, never both. That makes the Phase 9 defect unrepresentable: a card-level
 * pressable wrapping a child pressable produced `<button>` inside `<button>` on web — invalid
 * HTML, a duplicated and nested entry in the accessibility tree, and an ambiguous target for
 * Enter and Space. It was fixed three times over in `ClassCard`, `ClassListCard` and
 * `StudentListItem` by splitting the row into siblings inside an inert container, and this
 * component starts from that shape rather than being retrofitted into it.
 *
 * So there are exactly two structures, and TypeScript will not let a caller invent a third:
 *
 *   onPress   → the row is a single `AnimatedPressable`, with a chevron so it reads as opening
 *               something. It has no interactive descendants.
 *   control   → the row is an inert `View`. The control it holds is the only interactive element,
 *               owns its own accessible name and state, and receives Enter and Space by itself.
 * ============================================================================
 *
 * Built from the existing design system — `Card` supplies the surface, so this only draws the row
 * interior and its optional divider.
 */
export function SettingsRow(props: SettingsRowProps) {
  const { label, description, icon, value, divider = false, testID } = props;

  const body = (
    <>
      {icon ? (
        <View style={styles.well}>
          <Icon name={icon} size={18} color={palette.primary} />
        </View>
      ) : null}

      <View style={styles.text}>
        <Text variant="bodyLg" color={palette.onSurface}>
          {label}
        </Text>
        {description ? (
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {description}
          </Text>
        ) : null}
      </View>
    </>
  );

  // Interactive variant: the row is the control. No interactive descendants, by construction.
  if (props.onPress) {
    return (
      <AnimatedPressable
        onPress={props.onPress}
        // Opacity rather than scale: a shrinking full-width row inside a card reads as a layout
        // jump, which is the same reasoning the roster rows use.
        feedback="opacity"
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel ?? label}
        {...(props.accessibilityHint ? { accessibilityHint: props.accessibilityHint } : {})}
        testID={testID}
        style={[styles.row, divider && styles.divider]}
      >
        {body}

        {value ? (
          <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
            {value}
          </Text>
        ) : null}

        <Icon name="chevronRight" size={20} color={palette.outline} />
      </AnimatedPressable>
    );
  }

  // Inert variant: the container is a plain View, so whatever `control` holds is the only
  // interactive element in the row and keeps sole ownership of focus, Enter and Space.
  return (
    <View style={[styles.row, divider && styles.divider]} testID={testID}>
      {body}

      {value ? (
        <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
          {value}
        </Text>
      ) : null}

      {props.control ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryFixed,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
