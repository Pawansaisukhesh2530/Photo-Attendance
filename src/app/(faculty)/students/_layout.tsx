import { Stack } from 'expo-router';

import { palette } from '@/theme';

/**
 * Nested stack for the students area.
 *
 * Mirrors the class-detail stack: the list is the tab root and the profile pushes on top with a
 * proper back gesture, while the tab bar stays put. Sitting inside the `(faculty)` group means both
 * screens inherit that layout's AuthGuard and FACULTY role check rather than needing their own.
 */
export default function StudentsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.surfaceContainerLow },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[studentId]" />
    </Stack>
  );
}
