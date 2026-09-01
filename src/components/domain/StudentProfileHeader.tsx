import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/primitives/Avatar';
import { Card } from '@/components/primitives/Card';
import { Icon } from '@/components/primitives/Icon';
import { ProgressRing } from '@/components/primitives/ProgressRing';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing } from '@/theme';
import type { Student } from '@/types';

export interface StudentProfileHeaderProps {
  student: Student;
}

/**
 * Identity block at the top of a student profile.
 *
 * Avatar, name and the two identifiers that actually get used — the institutional student ID and the
 * per-class roll number, which are different things and are routinely confused, so both are labelled.
 * Overall attendance sits alongside as a ring, reusing the established component so the figure looks
 * the same here as on a class card.
 *
 * Deliberately plain: no cover image, no gradient. This is a record about a person in an
 * administrative system, and the identity needs to be legible at a glance rather than decorated.
 */
export function StudentProfileHeader({ student }: StudentProfileHeaderProps) {
  const isTwin = student.twinGroupId !== null;

  return (
    <Card>
      <View style={styles.top}>
        <Avatar
          name={student.name}
          uri={student.avatarUrl}
          size={64}
          {...(isTwin ? { ringColor: palette.tertiaryFixedDim } : {})}
        />

        <View style={styles.identity}>
          <Text variant="headlineSm" color={palette.onSurface} numberOfLines={2}>
            {student.name}
          </Text>

          {isTwin ? (
            <View style={styles.twinFlag}>
              <Icon name="twin" size={12} color={palette.tertiaryContainer} />
              <Text variant="labelMd" color={palette.tertiaryContainer}>
                Look-alike on record
              </Text>
            </View>
          ) : null}
        </View>

        <ProgressRing percentage={student.overallAttendance} size={56} strokeWidth={5} />
      </View>

      <View style={styles.divider} />

      {/* The two identifiers, labelled so they cannot be mistaken for each other. */}
      <View style={styles.idRow}>
        <View style={styles.idBlock}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            STUDENT ID
          </Text>
          <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
            {student.studentId}
          </Text>
        </View>

        <View style={styles.idSeparator} />

        <View style={styles.idBlock}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            ROLL NUMBER
          </Text>
          <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
            {student.rollNumber}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    gap: spacing.xs,
  },
  twinFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: palette.outlineVariant,
    marginVertical: spacing.md,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  idBlock: {
    flex: 1,
    gap: 2,
  },
  idSeparator: {
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: palette.outlineVariant,
    marginHorizontal: spacing.md,
    borderRadius: radius.full,
  },
});
