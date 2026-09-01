import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/primitives/Icon';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing } from '@/theme';

export interface MockPersistenceNoteProps {
  /** What the action would persist, e.g. "faculty records". */
  subject: string;
}

/**
 * States, on screen, that a change is not really saved.
 *
 * The admin area has working create, edit and assignment flows, but there is no backend behind them
 * — changes live in memory for the lifetime of the process and a reload restores the fixtures.
 *
 * This is shown rather than hidden on purpose. An administrator who believes they have added a
 * lecturer, closes the tab, and finds them gone has been actively misled; a form that silently
 * pretends to persist is worse than one that admits it does not. It is also the clearest possible
 * marker of the backend boundary for whoever implements the real API.
 */
export function MockPersistenceNote({ subject }: MockPersistenceNoteProps) {
  return (
    <View style={styles.note}>
      <Icon name="info" size={16} color={palette.onTertiaryFixedVariant} />
      <Text variant="labelMd" color={palette.onTertiaryFixedVariant} style={styles.text}>
        Not connected to a backend yet. Changes to {subject} are held in memory for this session
        only and are lost on reload.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.tertiaryFixed,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.tertiaryFixedDim,
  },
  text: {
    flex: 1,
  },
});
