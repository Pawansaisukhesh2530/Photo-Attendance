import { Stack } from 'expo-router';


/** Class catalogue stack. List is the tab root; detail and the create form push on top. */
export default function AdminClassesLayout() {
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
      <Stack.Screen name="[classId]" />
    </Stack>
  );
}
