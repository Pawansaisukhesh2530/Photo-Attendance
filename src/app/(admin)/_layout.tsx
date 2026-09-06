import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AuthGuard, GlassSurface, LiquidTabIcon } from '@/components';
import { fontFamilies, palette, spacing, useResponsive } from '@/theme';

/**
 * Admin navigation.
 *
 * One route tree serves both platforms; only the chrome differs.
 *
 *   expanded (desktop / large tablet)
 *     The tab bar is removed entirely and `AdminScaffold` renders a persistent sidebar with all
 *     eight destinations. This is what the Stitch desktop design shows and what administrators
 *     expect from a college portal.
 *
 *   compact / regular (phone / small tablet)
 *     Five bottom tabs — Dashboard, Faculty, Students, Classes, More — with Attendance, Reports,
 *     Audit and Settings behind More. Eight tabs on a 320dp screen would put every target under
 *     the comfortable minimum, and a sidebar would eat half the width.
 *
 * A drawer was considered and rejected: it adds `@react-navigation/drawer` as a native dependency
 * and puts an extra tap in front of every navigation, for no gain over tabs plus a More page.
 *
 * `AuthGuard requireRole="ADMIN"` wraps the whole group, so protection is structural rather than a
 * matter of which links are visible. A faculty account resolving an `(admin)` deep link is
 * redirected to its own tree by the guard, not merely denied a menu entry.
 */
export default function AdminLayout() {
  const { isExpanded } = useResponsive();

  return (
    <AuthGuard requireRole="ADMIN">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.onSurfaceVariant,
          // Removed rather than hidden on desktop: `display: none` would still reserve layout and
          // still register in the accessibility tree as a second, redundant navigation.
          tabBarStyle: isExpanded ? styles.hidden : styles.tabBar,
          tabBarBackground: () => <GlassSurface intensity={80} style={StyleSheet.absoluteFill} />,
          tabBarButton: isExpanded ? () => null : undefined,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
          sceneStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Overview',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="dashboard" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="faculty"
          options={{
            title: 'Faculty',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="faculty" color={color} focused={focused} />,
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
          name="classes"
          options={{
            title: 'Classes',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="classes" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, focused }) => <LiquidTabIcon name="menu" color={color} focused={focused} />,
          }}
        />

        {/*
          Registered for navigation and deep linking, intentionally absent from the tab bar. On a
          phone these are reached through More; on desktop, directly from the sidebar.
        */}
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="reports" options={{ href: null }} />
        <Tabs.Screen name="audit" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  tabBar: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: 24,
    marginHorizontal: spacing.sm + 2,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(0,0,0,0.32)',
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
