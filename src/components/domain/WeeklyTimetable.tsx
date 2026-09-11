import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { Text } from '@/components/primitives/Text';
import { palette, spacing } from '@/theme';
import type { TimetableSlot } from '@/types';
import { DAY_LABELS, DAY_SHORT } from '@/types';

const DAY_ORDER = [1, 2, 3, 4, 5] as const;

function formatTimeRange(start: string | null, end: string | null): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':');
    const hour = Number(h ?? 0);
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${m ?? '00'} ${meridiem}`;
  };
  if (!start || !end) return '—';
  return `${fmt(start)} – ${fmt(end)}`;
}

function groupByDay(slots: TimetableSlot[]): Map<number, TimetableSlot[]> {
  const map = new Map<number, TimetableSlot[]>();
  for (const day of DAY_ORDER) map.set(day, []);
  for (const slot of slots) {
    const d = slot.day_of_week;
    if (d >= 1 && d <= 5) map.get(d)!.push(slot);
  }
  for (const [, daySlots] of map) {
    daySlots.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  }
  return map;
}

export interface WeeklyTimetableProps {
  slots: TimetableSlot[];
  onEdit?: (slot: TimetableSlot) => void;
  onDelete?: (slot: TimetableSlot) => void;
}

export function WeeklyTimetable({ slots, onEdit, onDelete }: WeeklyTimetableProps) {
  const grouped = groupByDay(slots);
  const interactive = Boolean(onEdit || onDelete);

  return (
    <View style={styles.table}>
      {/* Header */}
      <View style={[styles.row, styles.headerRow]}>
        <Text variant="labelMd" style={[styles.cell, styles.dayCol]} color={palette.onSurface}>
          Day
        </Text>
        <Text variant="labelMd" style={[styles.cell, styles.timeCol]} color={palette.onSurface}>
          Time
        </Text>
        <Text variant="labelMd" style={[styles.cell, styles.locCol]} color={palette.onSurface}>
          Location
        </Text>
        <Text variant="labelMd" style={[styles.cell, styles.classCol]} color={palette.onSurface}>
          Class Name
        </Text>
        <Text variant="labelMd" style={[styles.cell, styles.subjectCol]} color={palette.onSurface}>
          Subject
        </Text>
        {interactive && (
          <Text
            variant="labelMd"
            style={[styles.cell, styles.actionsCol]}
            color={palette.onSurface}
          >
            {/* empty header for action buttons */}
          </Text>
        )}
      </View>

      {/* Rows by day */}
      {DAY_ORDER.map((day) => {
        const daySlots = grouped.get(day) ?? [];
        return daySlots.map((slot, idx) => {
          const isFree = slot.slot_type === 'FREE';
          return (
            <View
              key={slot.id}
              style={[
                styles.row,
                idx === daySlots.length - 1 && styles.rowLast,
                isFree && styles.freeRow,
              ]}
            >
              <Text
                variant="bodyMd"
                style={[styles.cell, styles.dayCol]}
                color={isFree ? palette.outlineVariant : palette.onSurface}
              >
                {idx === 0 ? DAY_SHORT[day] ?? '' : ''}
              </Text>
              <Text
                variant="bodyMd"
                style={[styles.cell, styles.timeCol]}
                color={isFree ? palette.outlineVariant : palette.onSurface}
              >
                {formatTimeRange(slot.start_time, slot.end_time)}
              </Text>
              <Text
                variant="bodyMd"
                style={[styles.cell, styles.locCol]}
                color={isFree ? palette.outlineVariant : palette.onSurfaceVariant}
              >
                {slot.room ?? '—'}
              </Text>
              <Text
                variant="bodyMd"
                style={[styles.cell, styles.classCol]}
                color={isFree ? palette.outlineVariant : palette.onSurface}
              >
                {isFree ? 'Free' : slot.class_name}
              </Text>
              <Text
                variant="bodyMd"
                style={[styles.cell, styles.subjectCol]}
                color={isFree ? palette.outlineVariant : palette.onSurfaceVariant}
              >
                {isFree ? '—' : (slot.subject ?? '—')}
              </Text>
              {interactive && (
                <View style={[styles.cell, styles.actionsCol]}>
                  {onEdit && (
                    <AnimatedPressable
                      onPress={() => onEdit(slot)}
                      feedback="opacity"
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${isFree ? 'free period' : slot.class_name}`}
                      style={styles.actionBtn}
                    >
                      <Icon name="edit" size={18} color={palette.primary} />
                    </AnimatedPressable>
                  )}
                  {onDelete && (
                    <AnimatedPressable
                      onPress={() => onDelete(slot)}
                      feedback="opacity"
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${isFree ? 'free period' : slot.class_name}`}
                      style={styles.actionBtn}
                    >
                      <Icon name="delete" size={18} color={palette.error} />
                    </AnimatedPressable>
                  )}
                </View>
              )}
            </View>
          );
        });
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    minWidth: 600,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: palette.outlineVariant,
  },
  headerRow: {
    backgroundColor: palette.surfaceVariant,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  freeRow: {
    opacity: 0.5,
  },
  cell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: palette.outlineVariant,
    minWidth: 0,
  },
  dayCol: { flex: 1.2 },
  timeCol: { flex: 2 },
  locCol: { flex: 1.2 },
  classCol: { flex: 1.8 },
  subjectCol: { flex: 2 },
  actionsCol: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRightWidth: 0,
  },
  actionBtn: {
    padding: spacing.xs,
    borderRadius: 6,
  },
});
