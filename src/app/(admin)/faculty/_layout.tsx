import { Stack } from 'expo-router';


/**
 * Faculty management stack.
 *
 * The list is the tab root; the profile and the create form push on top with a back gesture, while
 * the tab bar (phone) or sidebar (desktop) stays put. Sitting inside `(admin)` means all three
 * inherit that group's `AuthGuard requireRole="ADMIN"` rather than each needing its own.
 */
export default function AdminFacultyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[facultyId]" />
    </Stack>
  );
}
