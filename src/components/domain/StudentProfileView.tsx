import { useCallback, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import { Card } from '@/components/primitives/Card';
import { Icon, type IconName } from '@/components/primitives/Icon';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { SkeletonCard } from '@/components/primitives/Skeleton';
import { EmptyState, ErrorState } from '@/components/primitives/StateViews';
import { Text } from '@/components/primitives/Text';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import { useClasses } from '@/hooks/useClasses';
import { useStudent } from '@/hooks/useStudents';
import { palette, radius, spacing, statusColors } from '@/theme';
import { formatShortDate } from '@/utils/datetime';

import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { ClassCodeTag } from './ClassCodeTag';
import { FaceEnrolmentCard } from './FaceEnrolmentCard';
import { StudentProfileHeader } from './StudentProfileHeader';

/** Simple label/value row for academic metadata. */
function FactRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.factRow, !last && styles.factDivider]}>
      <Icon name={icon} size={16} color={palette.outline} />
      <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.factLabel}>
        {label}
      </Text>
      <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Student profile.
 *
 * Read-only. Displays what the service returns and changes nothing — no attendance is editable from
 * here, and none of the recognition, review, finalization or audit behaviour is touched.
 *
 * Structure follows the approved order: identity, academic information, classes, attendance summary,
 * attendance by class, recent attendance, face enrolment.
 *
 * Multi-class is assumed throughout. `enrolledClassIds` drives the classes section and
 * `attendanceByClass` the per-class breakdown, so a student sitting in two or three classes renders
 * correctly rather than collapsing to their primary one.
 */
/**
 * Title and subtitle for whatever chrome the caller supplies.
 *
 * Exposed as a hook so the header can name the student while the body owns the fetch — both read
 * the same cached query, so this costs no extra request.
 */
export function useStudentHeaderTitle(studentId: string | undefined): {
  title: string;
  subtitle: string | undefined;
} {
  const { data: student } = useStudent(studentId);
  return {
    title: student?.name ?? 'Student',
    subtitle: student?.rollNumber,
  };
}

export interface StudentProfileViewProps {
  studentId: string | undefined;
  /**
   * Rendered above the content, and again in every state.
   *
   * Passed in rather than built here because the two callers need different chrome: the faculty
   * route wants `AppHeader`, the admin route wants `AdminScaffold`'s header, which on desktop
   * includes a sidebar and breadcrumbs. The body — which is the part worth sharing — is identical.
   */
  header?: ReactNode;
  /** Called by the "Student not found" empty state. */
  onNotFoundAction?: () => void;
  notFoundActionLabel?: string;
}

/**
 * The student profile body, shared by the faculty and admin routes.
 *
 * Extracted rather than copied. Admin sees the same student the lecturer sees — same figures, same
 * face-enrolment status, same per-class breakdown — so two implementations would be two places for
 * that to drift. The only difference between the callers is the surrounding chrome.
 */
export function StudentProfileView({
  studentId,
  header,
  onNotFoundAction,
  notFoundActionLabel = 'Go back',
}: StudentProfileViewProps) {
  const { data: student, isLoading, isRefetching, error, refetch } = useStudent(studentId);
  const { data: classes } = useClasses();

  /** Resolves class ids to display data. Falls back to the raw id if a class is not in scope. */
  const classLookup = useMemo(() => {
    const map = new Map<string, { displayCode: string; subject: string }>();
    for (const c of classes ?? []) {
      map.set(c.id, { displayCode: c.displayCode, subject: c.subject });
    }
    return map;
  }, [classes]);

  const enrolledClasses = useMemo(
    () =>
      (student?.enrolledClassIds ?? []).map((id) => ({
        id,
        displayCode: classLookup.get(id)?.displayCode ?? id,
        subject: classLookup.get(id)?.subject ?? 'Class',
        percentage: student?.attendanceByClass[id] ?? null,
      })),
    [student, classLookup],
  );

  const retry = useCallback(() => void refetch(), [refetch]);

  /* ---------------------------------------------------------------- *
   * Loading
   * ---------------------------------------------------------------- */

  if (isLoading) {
    return (
      <>
        {header}
        <Screen scrollable>
          <View style={styles.skeletons}>
            <SkeletonCard height={168} />
            <SkeletonCard height={140} />
            <SkeletonCard height={110} />
            <SkeletonCard height={180} />
          </View>
        </Screen>
      </>
    );
  }

  /* ---------------------------------------------------------------- *
   * Not found vs. transport failure — different problems, different copy
   * ---------------------------------------------------------------- */

  if (error || !student) {
    const notFound = isApiError(error) && error.kind === 'NOT_FOUND';

    return (
      <>
        {header}
        <Screen>
          {notFound ? (
            <EmptyState
              icon="unknown"
              title="Student not found"
              message="This student may have been unenrolled, or the link is out of date."
              {...(onNotFoundAction
                ? { actionLabel: notFoundActionLabel, onAction: onNotFoundAction }
                : {})}
            />
          ) : (
            <ErrorState error={error} onRetry={retry} />
          )}
        </Screen>
      </>
    );
  }

  const belowThreshold = student.overallAttendance < ATTENDANCE_THRESHOLD;

  return (
    <>
      {header}
      <Screen
        scrollable
        onRefresh={retry}
        refreshing={isRefetching}
        contentContainerStyle={styles.content}
      >
        {/* Identity */}
        <View style={styles.block}>
          <StudentProfileHeader student={student} />
        </View>

        {/* Academic information */}
        <View style={styles.block}>
          <SectionHeader title="Academic" divider />
          <Card padded={false} style={styles.factCard}>
            <FactRow icon="institution" label="Department" value={student.department} />
            <FactRow icon="classes" label="Semester" value={`Semester ${student.semester}`} />
            <FactRow icon="students" label="Section" value={student.section} last />
          </Card>
        </View>

        {/* Classes */}
        <View style={styles.block}>
          <SectionHeader
            title="Classes"
            meta={
              enrolledClasses.length === 1 ? '1 class' : `${enrolledClasses.length} classes`
            }
            divider
          />

          {enrolledClasses.length === 0 ? (
            <Card>
              <EmptyState
                icon="classes"
                title="Not enrolled"
                message="This student is not enrolled in any of your classes."
              />
            </Card>
          ) : (
            <Card>
              <View style={styles.tagRow}>
                {enrolledClasses.map((c) => (
                  <ClassCodeTag key={c.id} code={c.displayCode} />
                ))}
              </View>
              {enrolledClasses.length > 1 ? (
                <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.multiNote}>
                  Enrolled in more than one of your classes.
                </Text>
              ) : null}
            </Card>
          )}
        </View>

        {/* Attendance summary */}
        <View style={styles.block}>
          <SectionHeader title="Attendance" divider />
          <Card>
            <View style={styles.summaryRow}>
              <Text
                variant="displayLg"
                color={belowThreshold ? palette.onTertiaryFixedVariant : palette.primary}
              >
                {student.overallAttendance}%
              </Text>
              <View style={styles.summaryText}>
                <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                  Overall across all enrolled classes
                </Text>
                {belowThreshold ? (
                  <View style={styles.warnRow}>
                    <Icon name="warning" size={14} color={palette.onTertiaryFixedVariant} />
                    <Text variant="labelMd" color={palette.onTertiaryFixedVariant}>
                      Below the {ATTENDANCE_THRESHOLD}% threshold
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        </View>

        {/* Attendance by class */}
        <View style={styles.block}>
          <SectionHeader title="Attendance by class" divider />
          {enrolledClasses.length === 0 ? (
            <Card>
              <EmptyState
                icon="reports"
                title="No class attendance"
                message="Per-class figures appear once the student is enrolled."
              />
            </Card>
          ) : (
            <Card>
              {enrolledClasses.map((c, index) => {
                const pct = c.percentage;
                const low = pct !== null && pct < ATTENDANCE_THRESHOLD;
                const accent = low ? palette.tertiaryFixedDim : palette.primary;

                return (
                  <View
                    key={c.id}
                    style={[
                      styles.byClassRow,
                      index < enrolledClasses.length - 1 && styles.byClassDivider,
                    ]}
                  >
                    <View style={styles.byClassTop}>
                      <ClassCodeTag code={c.displayCode} />
                      <Text
                        variant="bodyMd"
                        color={palette.onSurface}
                        numberOfLines={1}
                        style={styles.flex}
                      >
                        {c.subject}
                      </Text>
                      <Text
                        variant="bodyLg"
                        color={low ? palette.onTertiaryFixedVariant : palette.onSurface}
                      >
                        {pct === null ? '--' : `${pct}%`}
                      </Text>
                    </View>

                    <ProgressBar
                      progress={(pct ?? 0) / 100}
                      color={accent}
                      height={6}
                      animated={false}
                      accessibilityLabel={`${c.displayCode} attendance ${pct ?? 0} percent`}
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        {/* Recent attendance */}
        <View style={styles.block}>
          <SectionHeader
            title="Recent attendance"
            meta={student.recentAttendance.length > 0 ? 'Newest first' : undefined}
            divider
          />

          {student.recentAttendance.length === 0 ? (
            <Card>
              <EmptyState
                icon="history"
                title="No attendance recorded"
                message="Once attendance is taken for this student's classes, it will appear here."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {student.recentAttendance.map((entry, index) => (
                <View
                  key={`${entry.sessionId}-${entry.date}-${index}`}
                  style={[
                    styles.recentRow,
                    index < student.recentAttendance.length - 1 && styles.recentDivider,
                  ]}
                >
                  <View
                    style={[
                      styles.recentAccent,
                      { backgroundColor: statusColors[entry.status].accent },
                    ]}
                  />
                  <View style={styles.recentBody}>
                    <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
                      {entry.className}
                    </Text>
                    <Text variant="labelMd" color={palette.onSurfaceVariant}>
                      {formatShortDate(entry.date)}
                    </Text>
                  </View>
                  <AttendanceStatusBadge status={entry.status} />
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* Face enrolment — status display only, no biometric processing */}
        <View style={styles.block}>
          <SectionHeader title="Recognition" divider />
        <FaceEnrolmentCard enrolled={student.faceEnrolled} studentName={student.name} studentId={student.id} />
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  skeletons: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  block: {
    marginTop: spacing.md,
  },
  factCard: {
    paddingHorizontal: spacing.md,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  factDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  factLabel: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  multiNote: {
    marginTop: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryText: {
    flex: 1,
    gap: spacing.xs,
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  byClassRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  byClassDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  byClassTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.md,
    paddingLeft: spacing.md,
  },
  recentDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  recentAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: radius.full,
  },
  recentBody: {
    flex: 1,
    gap: 2,
  },
});
