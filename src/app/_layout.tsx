import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { ToastProvider } from '@/components';
import { useAuthStore, wireAuthToApiClient } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferences';
import { queryClient } from '@/store/queryClient';
import { palette, useAppFonts } from '@/theme';

const glassNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: palette.primary,
    background: 'transparent',
    card: 'transparent',
    text: palette.onSurface,
    border: palette.outlineVariant,
    notification: palette.error,
  },
};

/*
  Detach blurred navigator screens on web.

  `react-native-screens` only enables itself for iOS, Android and Windows, so on web
  `screensEnabled()` is false and expo-router's `MaybeScreen` falls back to a plain `View`. The
  consequence is that every tab screen you have visited stays in the DOM at full size, parked
  behind the active one at `zIndex: -1` with `aria-hidden` on its content — still laid out, and
  crucially still focusable.

  Measured on the admin console before this call: standing on Faculty, a keyboard user had to press
  Tab nineteen times through the stale Dashboard (its sidebar, its metric cards, its session rows)
  before reaching the page actually on screen. Every sidebar destination also appeared twice in the
  accessibility tree, and `aria-hidden` containers held focusable controls, which is invalid ARIA.

  Turning screens on for web routes `MaybeScreen` to the library's own web implementation, which
  applies `display: none` to a screen at activity state 0. That removes blurred screens from both
  the layout and the tab order while leaving them mounted, so React state and scroll position
  survive a tab switch.

  Web-only on purpose: native already gets the real native screen behaviour, and this call must not
  change it. It runs at module scope because the navigators read `screensEnabled()` as they render.
*/
if (Platform.OS === 'web') {
  enableScreens(true);
}

// Hold the native splash until fonts are loaded, the stored session is restored and device
// preferences have been read, so the first frame is the real UI rather than a flash of fallback
// fonts, the login screen for an already-signed-in user, or a default preference that is about to
// be replaced by a stored one.
void SplashScreen.preventAutoHideAsync();

// Connect the HTTP client to auth state once, at module scope, before any request runs.
wireAuthToApiClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const authStatus = useAuthStore((state) => state.status);
  const restore = useAuthStore((state) => state.restore);
  const preferencesHydrated = usePreferencesStore((state) => state.hydrated);
  const restorePreferences = usePreferencesStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    void restorePreferences();
  }, [restorePreferences]);

  const ready =
    (fontsLoaded || fontError !== null) && authStatus !== 'restoring' && preferencesHydrated;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    // GestureHandlerRootView must wrap everything for bottom sheets and swipe gestures
    // to receive touches, and must have flex: 1 or its subtree measures to zero height.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LinearGradient colors={['#040714', '#1a0d3a', '#05283b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
          <View pointerEvents="none" style={[styles.ambientOrb, styles.orbViolet]} />
          <View pointerEvents="none" style={[styles.ambientOrb, styles.orbCyan]} />
          <ThemeProvider value={glassNavigationTheme}>
          <ToastProvider>
            {/*
              Dark glyphs on our light surface. Under SDK 57 edge-to-edge the bar is
              translucent by default, so no background colour is set here — screen
              content shows through, which is why AppHeader owns the top inset.
            */}
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(faculty)" />
              <Stack.Screen name="(admin)" />
              {/*
                The capture flow is a full-screen modal stack rather than a tab: the
                camera and processing steps need the whole screen, and presenting them
                modally means the tab bar cannot be tapped mid-capture, which would
                otherwise abandon a session halfway through.
              */}
              <Stack.Screen
                name="attendance"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
            </Stack>
          </ToastProvider>
          </ThemeProvider>
          </LinearGradient>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  ambientOrb: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
    opacity: 0.34,
  },
  orbViolet: {
    top: -210,
    right: -100,
    backgroundColor: '#7048ff',
  },
  orbCyan: {
    bottom: -260,
    left: -150,
    backgroundColor: '#00a6c8',
  },
});
