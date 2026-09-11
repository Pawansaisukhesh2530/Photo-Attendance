import { Stack } from 'expo-router';

/** Timetable management stack. Editor is the root; the slot form pushes on top. */
export default function AdminTimetableLayout() {
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
    </Stack>
  );
}
