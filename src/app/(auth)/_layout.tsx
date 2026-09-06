import { Stack } from 'expo-router';

import { GuestGuard } from '@/components';

export default function AuthLayout() {
  return (
    <GuestGuard>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="login" />
        {/*
          Presented as a card rather than a modal: on Android a modal presentation with a
          keyboard-avoiding form clips awkwardly, and the screen has its own back-arrow
          header, so a push transition reads more naturally.
        */}
        <Stack.Screen name="forgot-password" />
      </Stack>
    </GuestGuard>
  );
}
