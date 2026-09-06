import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AuthGuard, GlassSurface, LiquidTabIcon } from '@/components';
import { fontFamilies, palette, spacing } from '@/theme';

/**
 * Faculty navigation: bottom tabs.
 *
 * This is the central mobile adaptation. Stitch uses a fixed 280px left sidebar with
 * nine links plus a footer — a pattern that has no place on a phone, where it would
 * either eat half the width or hide behind a hamburger that adds a tap to every
 * navigation.
 *
 * Five destinations are exposed as tabs. Settings is registered but hidden from the bar
 * (`href: null`) and reached from the Dashboard header instead, because it is a
 * low-frequency destination and a sixth tab would push each target under the ~64dp
 * comfortable minimum on a 320dp screen.
 *
 * The capture flow is deliberately absent: it lives in the root-level `attendance`
 * modal stack so it can occupy the full screen.
 */
export default function FacultyLayout() {
  return (
    <AuthGuard requireRole="FACULTY">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.onSurfaceVariant,
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => <GlassSurface intensity={80} style={StyleSheet.absoluteFill} />,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
          sceneStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Today',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="dashboard" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="classes"
          options={{
            title: 'Classes',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="classes" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="students"
          options={{
            title: 'Students',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="students" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="history" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="reports" color={color} focused={focused} />,
          }}
        />

        {/* Registered for navigation, intentionally not shown in the tab bar. */}
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="class" options={{ href: null }} />
      </Tabs>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: 24,
    marginHorizontal: spacing.sm + 2,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(0,0,0,0.32)',
    // Height and bottom inset are handled by the navigator; only paddingTop is nudged
    // so glyphs sit optically centred above their labels.
    paddingTop: spacing.xs,
  },
  tabItem: {
    paddingVertical: spacing.xs / 2,
  },
  tabLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
