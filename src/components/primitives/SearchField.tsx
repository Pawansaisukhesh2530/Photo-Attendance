import { Pressable, StyleSheet, TextInput, View } from 'react-native';

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
  return (
    <View style={styles.field}>
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
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  input: {
    flex: 1,
    ...typography.bodyLg,
    color: palette.onSurface,
    paddingVertical: 0,
  },
});
