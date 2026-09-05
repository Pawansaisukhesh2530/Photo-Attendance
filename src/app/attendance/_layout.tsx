import { Stack } from 'expo-router';

import { AuthGuard } from '@/components';
import { palette } from '@/theme';

/**
 * The attendance capture flow.
 *
 * A dedicated stack presented modally from the root, so the tab bar is out of the way for the
 * camera and cannot be tapped mid-capture. Wrapped in `AuthGuard` because the root modal sits
 * outside the `(faculty)` group and would otherwise be reachable by deep link while signed
 * out.
 *
 * Gestures are disabled on camera and processing. A back-swipe out of the camera would drop a
 * photo the lecturer cannot retake once the class disperses, and out of processing would
 * strand a session mid-pipeline. Both screens provide an explicit, confirmed exit instead.
 * Results keeps its gesture — by then the session is saved and leaving is harmless.
 */
export default function AttendanceLayout() {
  return (
    <AuthGuard>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.surfaceContainerLow },
          animation: 'slide_from_right',
        }}
      >
        {/*
          Class selection keeps its back gesture — nothing has been captured yet, so leaving is
          harmless. Camera and processing do not, for the reasons below.
        */}
        <Stack.Screen name="[classId]/select" />
        <Stack.Screen name="[classId]/camera" options={{ gestureEnabled: false }} />
        <Stack.Screen name="[classId]/processing" options={{ gestureEnabled: false }} />
        <Stack.Screen name="[classId]/results" />
        <Stack.Screen name="[classId]/audit" />
      </Stack>
    </AuthGuard>
  );
}
