import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { palette, radius, spacing, touch, typography } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Leading glyph inside the field, as on the Stitch login inputs. */
  icon?: IconName;
  error?: string;
  helperText?: string;
  /** Renders a visibility toggle and masks input. */
  secure?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Text field matching the Stitch input treatment: label above, `surface-bright` fill,
 * `outline-variant` border, `primary` border plus ring on focus.
 *
 * Height is raised to the 48dp touch minimum. The Stitch original is `py-2` (roughly
 * 36dp tall), which is comfortable with a mouse and awkward with a thumb.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, icon, error, helperText, secure = false, containerStyle, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error
    ? palette.error
    : focused
      ? palette.primary
      : palette.outlineVariant;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="labelMd" color={palette.onSurface} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          { borderColor, borderWidth: focused || error ? 2 : 1 },
        ]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={20}
            color={focused ? palette.primary : palette.outline}
          />
        ) : null}

        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={palette.outline}
          secureTextEntry={secure && !revealed}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          accessibilityLabel={label}
          {...rest}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Icon name={revealed ? 'visible' : 'hidden'} size={20} color={palette.outline} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text variant="labelMd" color={palette.error} style={styles.message}>
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.message}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    // Stitch labels are sentence case, not uppercase, despite the tracking.
    letterSpacing: 0.2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.comfortable,
    paddingHorizontal: spacing.md,
    // The Stitch mobile login uses `surface-container-lowest` for input fills. The
    // desktop screens use `surface-bright`; mobile wins, since that is the target here.
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: radius.lg,
  },
  input: {
    flex: 1,
    ...typography.bodyLg,
    color: palette.onSurface,
    // Vertical padding is zero because the row is already height-constrained;
    // Android otherwise adds its own and pushes the text off-centre.
    paddingVertical: 0,
  },
  message: {
    marginTop: 2,
  },
});
