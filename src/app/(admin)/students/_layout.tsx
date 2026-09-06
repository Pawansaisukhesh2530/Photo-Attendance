import { Stack } from 'expo-router';


/** Student directory stack. List is the tab root; the profile pushes on top. */
export default function AdminStudentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[studentId]" />
      <Stack.Screen name="new" />
    </Stack>
  );
}
