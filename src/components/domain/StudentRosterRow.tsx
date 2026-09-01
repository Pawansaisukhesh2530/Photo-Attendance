import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/primitives/Avatar';
import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { ATTENDANCE_THRESHOLD } from '@/constants/config';
import { palette, spacing, touch } from '@/theme';
import type { Student } from '@/types';

export interface StudentRosterRowProps {
  student: Student;
  onPress?: (student: Student) => void;
  last?: boolean;
  /** Optional secondary context shown beside the roll number, e.g. the institutional student ID. */
  meta?: string;
}

/**
 * A student in an enrolment roster.
 *
 * Distinct from `StudentListItem`, which renders an `AttendanceRecord` inside a capture
 * session and carries statuses and AI confidence. This one renders a `Student` and shows
 * standing: name, roll number, overall attendance percentage.
 *
 * Memoised, and sized for virtualisation — class rosters run to 60 rows.
 */
export const StudentRosterRow = memo(function StudentRosterRow({
  student,
  onPress,
  last = false,
  meta,
}: StudentRosterRowProps) {
  const isLow = student.overallAttendance < ATTENDANCE_THRESHOLD;
  const isTwin = student.twinGroupId !== null;

  return (
    <AnimatedPressable
      onPress={onPress ? () => onPress(student) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${student.name}, roll ${student.rollNumber}, ${student.overallAttendance} percent attendance${isLow ? ', below threshold' : ''}`}
      feedback="opacity"
      style={[
        styles.row,
        !last && styles.divider,
      ]}
    >
      <Avatar
        name={student.name}
        uri={student.avatarUrl}
        size={40}
        {...(isTwin ? { ringColor: palette.tertiaryFixedDim } : {})}
      />

      <View style={styles.body}>
        <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
          {student.name}
        </Text>
        <View style={styles.metaRow}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            {student.rollNumber}
          </Text>
          {/* Extra context, e.g. the institutional student ID on the all-students roster. Omitted
              inside a class, where the roll number is already unambiguous. */}
          {meta ? (
            <Text variant="labelMd" color={palette.outline}>
              {meta}
            </Text>
          ) : null}
          {isTwin ? (
            <View style={styles.flag}>
              <Icon name="twin" size={12} color={palette.tertiaryContainer} />
              <Text variant="labelMd" color={palette.tertiaryContainer}>
                Twin
              </Text>
            </View>
          ) : null}
          {!student.faceEnrolled ? (
            <View style={styles.flag}>
              <Icon name="unknown" size={12} color={palette.outline} />
              <Text variant="labelMd" color={palette.outline}>
                Not enrolled
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.trailing}>
        {isLow ? <Icon name="warning" size={16} color={palette.onTertiaryFixedVariant} /> : null}
        <Text
          variant="bodyLg"
          color={isLow ? palette.onTertiaryFixedVariant : palette.onSurface}
        >
          {student.overallAttendance}%
        </Text>
        {onPress ? <Icon name="chevronRight" size={18} color={palette.outline} /> : null}
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: touch.large + 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
