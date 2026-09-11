import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Card,
  ClassCard,
  DashboardMetrics,
  EmptyState,
  ErrorState,
  Icon,
  Screen,
  SectionHeader,
  SessionHistoryRow,
  SkeletonCard,
  Text,
} from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useFacultyDashboard } from '@/hooks/useFacultyDashboard';
import { palette, spacing } from '@/theme';
import type { AttendanceSessionSummary, TodayClass, TimetableSlot } from '@/types';
import { formatLongDate, formatScheduleTime, greetingForNow } from '@/utils/datetime';

/**
 * Faculty dashboard — the app's home.
 *
 * Implements the Stitch Faculty Dashboard for mobile. Stitch lays this out as a
 * three-column grid: a 280px sidebar, a two-column class list, and a Recent Activity rail.
 * On a phone that becomes one scrolling column in priority order — greeting, metrics,
 * today's classes, recent activity — because a lecturer opening this app between periods
 * wants one thing, and it should be reachable without hunting.
 *
 * Discarded from the Stitch original, deliberately: the "Export Data" button (a desktop
 * reporting task that belongs on the Reports screen) and the "View Schedule" link (there is
 * no schedule screen in scope).
 */
export default function DashboardScreen() {
  const { user } = useAuth();
  const {
    metrics,
    todayClasses,
    todaySlots,
    recentSessions,
    isLoading,
    isRefreshing,
    error,
    refetch,
  } = useFacultyDashboard();

  // Surname only, matching the Stitch greeting "Good Morning, Dr. Sharma".
  const shortName = (() => {
    if (!user?.name) return null;
    const parts = user.name.trim().split(/\s+/);
    if (parts.length <= 2) return user.name;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  })();

  const handleTakeAttendance = useCallback((item: TodayClass) => {
    router.push({
      pathname: '/attendance/[classId]/select',
      params: { classId: item.id },
    });
  }, []);

  const handleViewRecord = useCallback((item: TodayClass) => {
    if (!item.sessionId) return;
    router.push({
      pathname: '/attendance/[classId]/results',
      params: { classId: item.id, sessionId: item.sessionId },
    });
  }, []);

  const handleOpenSession = useCallback((session: AttendanceSessionSummary) => {
    router.push({
      pathname: '/attendance/[classId]/results',
      params: { classId: session.classId, sessionId: session.id },
    });
  }, []);

  // Build a map from class_id to TodayClass for CLASS slots
  const classMap = new Map(todayClasses.map((c) => [c.id, c]));

  const header = (
    <AppHeader
      title="EduTrace Pro"
      {...(user?.name ? { subtitle: user.name } : {})}
      actions={[
        {
          icon: 'notifications',
          accessibilityLabel: 'Notifications',
          badged: metrics.pendingReviews > 0,
          onPress: () => {},
        },
        {
          icon: 'settings',
          accessibilityLabel: 'Settings',
          onPress: () => router.push('/(faculty)/settings'),
        },
      ]}
    />
  );

  // A failed schedule fetch replaces the whole body — without today's classes the screen
  // has nothing meaningful to show.
  if (error && !isLoading) {
    return (
      <>
        {header}
        <Screen respectBottomInset={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen
        scrollable
        respectBottomInset={false}
        onRefresh={refetch}
        refreshing={isRefreshing}
        contentContainerStyle={styles.content}
      >
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text variant="headlineLgMobile" color={palette.onSurface}>
            {greetingForNow()}
            {shortName ? `, ${shortName}` : ''}
          </Text>
          <View style={styles.dateRow}>
            <Icon name="calendar" size={16} color={palette.onSurfaceVariant} />
            <Text variant="bodyMd" color={palette.onSurfaceVariant}>
              {formatLongDate()}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.skeletons}>
            <SkeletonCard height={124} />
            <SkeletonCard height={124} />
            <SkeletonCard height={210} />
            <SkeletonCard height={210} />
          </View>
        ) : (
          <>
            <DashboardMetrics
              metrics={metrics}
              onPressPendingReviews={() => router.push('/(faculty)/history')}
            />

            {/* Today's classes */}
            <View style={styles.section}>
              <SectionHeader
                title="Today's Classes"
                meta={
                  todaySlots.length === 0
                    ? 'no classes'
                    : todaySlots.length === 1
                      ? '1 slot'
                      : `${todaySlots.length} slots`
                }
                divider
              />

              {todaySlots.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="calendar"
                    title="No classes today"
                    message="Enjoy the break. Your next scheduled class will appear here."
                    actionLabel="View all classes"
                    onAction={() => router.push('/(faculty)/classes')}
                  />
                </Card>
              ) : (
                <View style={styles.cardStack}>
                  {todaySlots.map((slot) => {
                    if (slot.slot_type === 'CLASS') {
                      const todayClass = classMap.get(slot.class_id ?? '');
                      if (!todayClass) return null;
                      return (
                        <ClassCard
                          key={`class-${slot.id}`}
                          item={todayClass}
                          onTakeAttendance={handleTakeAttendance}
                          onViewRecord={handleViewRecord}
                          onPress={() =>
                            router.push({
                              pathname: '/(faculty)/class/[classId]',
                              params: { classId: todayClass.id },
                            })
                          }
                        />
                      );
                    }

                    // FREE slot — greyed, non-actionable
                    return (
                      <View key={`free-${slot.id}`} style={styles.freeSlot}>
                        <View style={styles.freeSlotTime}>
                          <Icon name="clock" size={16} color={palette.onSurfaceVariant} />
                          <Text variant="labelMd" color={palette.onSurfaceVariant}>
                            {formatScheduleTime(slot.start_time ?? '')}
                          </Text>
                          <Text variant="labelMd" color={palette.outlineVariant}>
                            —
                          </Text>
                          <Text variant="labelMd" color={palette.onSurfaceVariant}>
                            {formatScheduleTime(slot.end_time ?? '')}
                          </Text>
                        </View>
                        <Text variant="bodyMd" color={palette.outlineVariant}>
                          Free Period
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Recent activity */}
            <View style={styles.section}>
              <SectionHeader
                title="Recent Activity"
                actionLabel="View all"
                onAction={() => router.push('/(faculty)/history')}
                divider
              />

              {recentSessions.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="history"
                    title="No sessions yet"
                    message="Attendance you record will show up here."
                  />
                </Card>
              ) : (
                <Card padded={false}>
                  {recentSessions.map((session, index) => (
                    <SessionHistoryRow
                      key={session.id}
                      session={session}
                      onPress={handleOpenSession}
                      last={index === recentSessions.length - 1}
                    />
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  greeting: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  skeletons: {
    gap: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
  },
  cardStack: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  freeSlot: {
    backgroundColor: palette.surfaceVariant,
    borderRadius: 12,
    padding: spacing.md,
    opacity: 0.6,
    gap: spacing.xs,
  },
  freeSlotTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
