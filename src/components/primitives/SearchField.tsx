import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';

import { palette, radius, spacing, touch, typography } from '@/theme';

import { Icon } from './Icon';

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/**
 * Search field.
 *
 * On desktop Stitch puts a global search in the top navigation bar. On a phone that bar
 * has room for a title and two icons, so search moves into the content of the screens
 * that need it. This is the in-content form of the same Stitch input treatment: leading
 * magnifier, 48px tall, `outline-variant` border going `primary` on focus.
 *
 * Includes a clear button, which the Stitch original lacks — without it, clearing a
 * query on a phone means holding backspace.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  onSubmit,
  autoFocus = false,
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <Icon name="search" size={20} color={palette.outline} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.outline}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
        clearButtonMode="never"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="close" size={18} color={palette.onSurfaceVariant} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.comfortable,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  fieldFocused: {
    backgroundColor: 'rgba(169,156,255,0.12)',
    borderColor: palette.primary,
    borderWidth: 2,
    boxShadow: '0 0 0 3px rgba(169,156,255,0.14)',
  },
  input: {
    flex: 1,
    ...typography.bodyLg,
    color: palette.onSurface,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
});
