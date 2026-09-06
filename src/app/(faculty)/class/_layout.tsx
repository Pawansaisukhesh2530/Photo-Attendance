import { Stack } from 'expo-router';


/**
 * Nested stack for class detail.
 *
 * Declared as its own stack inside the faculty tabs so detail screens push and pop with a
 * proper back gesture while the tab bar stays put. Keeping it inside the `(faculty)` group
 * means it inherits the AuthGuard and role protection from that layout rather than needing
 * its own.
 */
export default function ClassStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="[classId]" />
    </Stack>
  );
}
