import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, spacing, touch, useResponsive } from '@/theme';

import { AdminSidebar } from './AdminSidebar';

export interface AdminBreadcrumb {
  label: string;
  href?: string;
}

export interface AdminScaffoldProps {
  /** Route segment of the active destination, so the sidebar can mark it. */
  active: string;
  title: string;
  subtitle?: string;
  /** Desktop breadcrumbs. Omitted on phones, where the back affordance carries the hierarchy. */
  breadcrumbs?: AdminBreadcrumb[];
  /** Primary action, e.g. "Add faculty". Rendered in the page header on every size. */
  action?: ReactNode;
  /** Shown on phones when this page was pushed rather than tab-selected. */
  onBack?: () => void;
  institutionName?: string;
  institutionCode?: string;
  children: ReactNode;
}

/**
 * The frame every admin page sits in.
 *
 * One component produces both experiences rather than two parallel screen trees:
 *
 *   expanded (desktop / large tablet)
 *     Persistent sidebar on the left, page header with breadcrumbs, content constrained so text
 *     lines do not run the full width of a 27-inch monitor.
 *
 *   compact / regular (phone / small tablet)
 *     No sidebar — the bottom tabs and the More menu own navigation. A conventional mobile header
 *     with an optional back affordance.
 *
 * Keeping it in one component is what stops the two platforms drifting apart: a new admin page gets
 * correct desktop and mobile chrome without deciding anything, and a change to the frame lands on
 * both at once.
 *
 * The tab bar is hidden at `expanded` by the layout, so the sidebar is the only navigation there
 * and the two never appear together.
 */
export function AdminScaffold({
  active,
  title,
  subtitle,
  breadcrumbs,
  action,
  onBack,
  institutionName = 'EduTrace Pro',
  institutionCode = 'EDU',
  children,
}: AdminScaffoldProps) {
  const { isExpanded } = useResponsive();
  const insets = useSafeAreaInsets();

  if (isExpanded) {
    return (
      <View style={styles.desktopRoot}>
        <AdminSidebar
          active={active}
          institutionName={institutionName}
          institutionCode={institutionCode}
        />

        <View style={styles.desktopMain}>
          <View style={[styles.desktopHeader, { paddingTop: insets.top + spacing.md }]}>
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <View style={styles.crumbs}>
                {breadcrumbs.map((crumb, index) => {
                  const last = index === breadcrumbs.length - 1;
                  return (
                    <View key={`${crumb.label}-${index}`} style={styles.crumb}>
                      {index > 0 ? (
                        <Icon name="chevronRight" size={14} color={palette.outline} />
                      ) : null}
                      <Text
                        variant="labelMd"
                        color={last ? palette.onSurfaceVariant : palette.primary}
                        {...(crumb.href && !last
                          ? {
                              onPress: () => router.replace(crumb.href as never),
                              accessibilityRole: 'link' as const,
                            }
                          : {})}
                      >
                        {crumb.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.desktopTitleRow}>
              <View style={styles.desktopTitleText}>
                <Text variant="headlineLg" color={palette.onSurface} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="bodyMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {action}
            </View>
          </View>

          {/* Content is capped: a data table stretched across a very wide monitor is unreadable. */}
          <View style={styles.desktopBody}>
            <View style={styles.desktopConstrain}>{children}</View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mobileRoot}>
      <View style={[styles.mobileHeader, { paddingTop: insets.top + spacing.sm }]}>
        {onBack ? (
          <AnimatedPressable
            onPress={onBack}
            feedback="opacity"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
          >
            <Icon name="chevronLeft" size={24} color={palette.onSurface} />
          </AnimatedPressable>
        ) : null}

        <View style={styles.mobileTitleText}>
          <Text variant="titleLg" color={palette.onSurface} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action}
      </View>

      <View style={styles.mobileBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: palette.surfaceContainerLow,
  },
  desktopMain: {
    flex: 1,
    // `minWidth: 0` lets the flex child shrink instead of forcing the row wider than the window,
    // which is what produces horizontal overflow on web.
    minWidth: 0,
  },
  desktopHeader: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: palette.outlineVariant,
  },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  desktopTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  desktopTitleText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  desktopBody: {
    flex: 1,
    minWidth: 0,
  },
  desktopConstrain: {
    flex: 1,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    minWidth: 0,
  },
  mobileRoot: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
  },
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.screen,
    paddingBottom: spacing.sm,
    backgroundColor: palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: palette.outlineVariant,
  },
  backButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  mobileTitleText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  mobileBody: {
    flex: 1,
  },
});
