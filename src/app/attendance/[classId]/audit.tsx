import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  AuditTimeline,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Screen,
  SkeletonListItem,
  Text,
} from '@/components';
import { useAttendanceSession } from '@/hooks/useAttendance';
import { useAuditEntries } from '@/hooks/useAudit';
import { palette, radius, spacing } from '@/theme';
import { formatShortDate } from '@/utils/datetime';

/**
 * Change history for one attendance session.
 *
 * Reached from the finalized banner on the results screen. Read-only: the backend owns the
 * persisted audit trail, and this screen renders what it reports.
 *
 * No Stitch screen exists for this — the desktop design implies a wide Audit Logs table under
 * the admin sidebar. This uses the established mobile language instead: a card, a section note,
 * and the vertical `AuditTimeline`.
 */
export default function AuditScreen() {
  const { sessionId } = useLocalSearchParams<{ classId: string; sessionId: string }>();

  const { data: session } = useAttendanceSession(sessionId);
  const { data: entries, isLoading, error, refetch, isRefetching } = useAuditEntries(
    sessionId ? { sessionId } : undefined,
  );

  const header = (
    <AppHeader
      title="Change history"
      {...(session
        ? {
            subtitle: `${session.classDisplayCode} · ${formatShortDate(session.capturedAt)}`,
          }
        : {})}
      onBack={() => router.back()}
    />
  );

  if (error) {
    return (
      <>
        {header}
        <Screen>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen scrollable onRefresh={() => void refetch()} refreshing={isRefetching}>
        <View style={styles.note}>
          <Icon name="info" size={18} color={palette.primary} />
          <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flex}>
            Every change to this register is recorded, including corrections made after it was
            finalized.
          </Text>
        </View>

        {isLoading ? (
          <Card style={styles.card}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        ) : !entries || entries.length === 0 ? (
          <Card style={styles.card}>
            <EmptyState
              icon="audit"
              title="No changes recorded"
              message="Changes to this attendance record will appear here."
            />
          </Card>
        ) : (
          <Card style={styles.card}>
            <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.count}>
              {entries.length} {entries.length === 1 ? 'ENTRY' : 'ENTRIES'} · NEWEST FIRST
            </Text>
            <AuditTimeline entries={entries} />
          </Card>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainer,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  flex: {
    flex: 1,
  },
  card: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  count: {
    marginBottom: spacing.md,
  },
});
