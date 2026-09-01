import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { palette, radius } from '@/theme';

import { Text } from './Text';

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  /** Coloured ring, used to mark students flagged as twins. */
  ringColor?: string;
}

/** "Aanya Gupta" -> "AG". Falls back to one letter for mononyms. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

/**
 * Student and faculty avatar.
 *
 * Uses `expo-image` rather than React Native's `Image` for its memory/disk cache,
 * which matters on a 60-row roster where every cell loads a remote portrait.
 * Falls back to initials whenever no photo is available, so rosters never render as a
 * grid of grey boxes.
 */
export function Avatar({ name, uri, size = 40, ringColor }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: radius.full };

  return (
    <View
      style={[
        styles.container,
        dimension,
        ringColor ? { borderWidth: 2, borderColor: ringColor } : styles.defaultBorder,
      ]}
      accessible
      accessibilityLabel={`${name} profile photo`}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={dimension}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <Text
          variant={size >= 56 ? 'titleLg' : 'labelMd'}
          color={palette.onPrimaryFixed}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryFixed,
    overflow: 'hidden',
  },
  defaultBorder: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.outlineVariant,
  },
});
