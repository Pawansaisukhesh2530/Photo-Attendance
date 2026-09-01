import { Stack } from 'expo-router';

import { palette } from '@/theme';

/** Student directory stack. List is the tab root; the profile pushes on top. */
export default function AdminStudentsLayout() {
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
