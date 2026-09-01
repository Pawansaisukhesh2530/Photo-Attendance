import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/primitives/Text';
import { fontFamilies, palette, radius, spacing } from '@/theme';

export interface ClassCodeTagProps {
  code: string;
}

/**
 * The class-code chip that sits beside a subject name.
 *
 * Distinct from `Badge` on purpose. Stitch renders this as `rounded` (4px) rather than a
 * pill, at 11px bold on `surface-container-highest` — its design system reserves the fully
 * rounded pill for status indicators specifically, "to make them instantly recognizable
 * as distinct from interactive buttons". Reusing the pill here would blur that signal.
 */
export function ClassCodeTag({ code }: ClassCodeTagProps) {
  return (
    <View style={styles.tag}>
      <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.label}>
        {code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.base,
    backgroundColor: palette.surfaceContainerHighest,
  },
  label: {
    // Stitch uses 11px bold here, a half-step below `label-md`'s 12px.
    fontSize: 11,
    fontFamily: fontFamilies.bold,
    letterSpacing: 0.2,
  },
});
