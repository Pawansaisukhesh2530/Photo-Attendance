import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  Button,
  Card,
  FilterChips,
  Input,
  Screen,
  SectionHeader,
  SelectionSheet,
  Text,
  useToast,
  type FilterChipOption,
} from '@/components';
import { useInfiniteClasses } from '@/hooks/useClassAdmin';
import { useFacultyMember } from '@/hooks/useFacultyAdmin';
import {
  useCreateTimetableSlot,
  useFacultyTimetable,
  useUpdateTimetableSlot,
} from '@/hooks/useTimetable';
import { palette, spacing } from '@/theme';
import type { SlotType, TimetableSlot } from '@/types';
import { DAY_LABELS } from '@/types';

const HALF_HOURS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00',
];

function formatMeridian(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const hour = Number(h ?? 0);
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? '00'} ${meridiem}`;
}

/**
 * Create or edit a timetable slot.
 *
 * One screen for both; `?slotId=` switches to edit mode. `facultyId` is always required.
 * Uses the classes/new.tsx convention.
 */
export default function AdminTimetableSlotFormScreen() {
  const { facultyId, slotId } = useLocalSearchParams<{
    facultyId: string;
    slotId?: string;
  }>();
  const isEdit = Boolean(slotId);
  const toast = useToast();

  const { data: member } = useFacultyMember(facultyId);
  const { data: slots } = useFacultyTimetable(facultyId);
  const { data: classPages } = useInfiniteClasses({ pageSize: 100 });
  const allClasses = useMemo(
    () => (classPages?.pages ?? []).flatMap((p) => p.items),
    [classPages],
  );

  const create = useCreateTimetableSlot();
  const update = useUpdateTimetableSlot();
  const pending = create.isPending || update.isPending;

  // Form state
  const [seeded, setSeeded] = useState(false);
  const [slotType, setSlotType] = useState<SlotType>('CLASS');
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [breakLabel, setBreakLabel] = useState('');
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [room, setRoom] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  // Pickers
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [classSheetOpen, setClassSheetOpen] = useState(false);
  const [startSheetOpen, setStartSheetOpen] = useState(false);
  const [endSheetOpen, setEndSheetOpen] = useState(false);

  // Seed from existing slot for edit
  const existingSlot: TimetableSlot | undefined = isEdit
    ? slots?.find((s) => s.id === slotId)
    : undefined;

  if (isEdit && existingSlot && !seeded) {
    setSlotType(existingSlot.slot_type);
    setDayOfWeek(existingSlot.day_of_week);
    setClassId(existingSlot.class_id);
    setBreakLabel(existingSlot.break_label ?? '');
    setStartTime(existingSlot.start_time?.slice(0, 5) ?? null);
    setEndTime(existingSlot.end_time?.slice(0, 5) ?? null);
    setRoom(existingSlot.room ?? '');
    setSeeded(true);
  }

  // Assigned classes for this faculty
  const assignedClassIds = useMemo(() => {
    if (!member) return new Set<string>();
    return new Set(member.assignedClassIds);
  }, [member]);

  const assignedClasses = useMemo(
    () => allClasses.filter((c) => assignedClassIds.has(c.id)),
    [allClasses, assignedClassIds],
  );

  const classOptions = useMemo(
    () =>
      assignedClasses.map((c) => ({
        id: c.id,
        label: c.className,
        description: c.subject,
        selected: c.id === classId,
      })),
    [assignedClasses, classId],
  );

  const dayOptions = useMemo(
    () =>
      Object.keys(DAY_LABELS).map(Number).map((d) => ({
        id: String(d),
        label: DAY_LABELS[d] ?? '',
        selected: d === dayOfWeek,
      })),
    [dayOfWeek],
  );

  const startTimeOptions = useMemo(
    () =>
      HALF_HOURS.map((t) => ({
        id: t,
        label: formatMeridian(t),
        selected: t === startTime,
      })),
    [startTime],
  );

  const endTimeOptions = useMemo(() => {
    return HALF_HOURS
      .filter((t) => t > (startTime ?? '07:00'))
      .map((t) => ({
        id: t,
        label: formatMeridian(t),
        selected: t === endTime,
      }));
  }, [startTime, endTime]);

  const submit = useCallback(async () => {
    setFieldErrors({});
    setBanner(null);

    if (!facultyId) {
      setBanner('Missing faculty ID.');
      return;
    }
    if (dayOfWeek === null) {
      setFieldErrors({ day_of_week: 'Required' });
      return;
    }
    if (!startTime || !endTime) {
      setFieldErrors({
        ...(!startTime ? { start_time: 'Required' } : {}),
        ...(!endTime ? { end_time: 'Required' } : {}),
      });
      return;
    }
    if (startTime >= endTime) {
      setFieldErrors({ end_time: 'Must be after start time' });
      return;
    }
    if (slotType === 'CLASS' && !classId) {
      setFieldErrors({ class_id: 'Select a class' });
      return;
    }
    if (slotType === 'FREE' && classId !== null) {
      setClassId(null);
    }

    const payload = {
      faculty_id: facultyId,
      slot_type: slotType,
      day_of_week: dayOfWeek,
      class_id: slotType === 'CLASS' ? classId : null,
      break_label: slotType === 'FREE' && breakLabel.trim() ? breakLabel.trim() : null,
      start_time: startTime,
      end_time: endTime,
      room: room.trim() || null,
    };

    try {
      if (isEdit && slotId && existingSlot) {
        const saved = await update.mutateAsync({
          slot_id: slotId,
          ...payload,
          version: existingSlot.version,
        });
        toast.show({ message: `Slot updated (${DAY_LABELS[saved.day_of_week]})`, tone: 'success' });
      } else {
        await create.mutateAsync(payload);
        toast.show({ message: 'Slot created', tone: 'success' });
      }
      router.back();
    } catch (error) {
      if (isApiError(error) && error.kind === 'VALIDATION' && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
        return;
      }
      setBanner(isApiError(error) ? error.message : 'Could not save. Please try again.');
    }
  }, [
    facultyId,
    dayOfWeek,
    startTime,
    endTime,
    slotType,
    classId,
    breakLabel,
    room,
    isEdit,
    slotId,
    existingSlot,
    create,
    update,
    toast,
  ]);

  const title = isEdit ? 'Edit slot' : 'Add slot';

  return (
    <AdminScaffold
      active="faculty"
      title={title}
      subtitle={member?.name ?? 'Loading...'}
      breadcrumbs={[
        { label: 'Administration', href: '/(admin)/dashboard' },
        { label: 'Faculty', href: '/(admin)/faculty' },
        { label: member?.name ?? 'Profile', href: `/(admin)/faculty/${facultyId}` },
        { label: 'Timetable', href: `/(admin)/timetable?facultyId=${facultyId}` },
        { label: title },
      ]}
      onBack={() => router.back()}
    >
      <Screen scrollable contentContainerStyle={styles.content}>
        {banner ? (
          <Card style={styles.banner}>
            <Text variant="bodyMd" color={palette.onErrorContainer}>
              {banner}
            </Text>
          </Card>
        ) : null}

        {/* Slot type */}
        <View style={styles.block}>
          <SectionHeader title="Type" divider />
          <Card>
            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurface}>
                Slot type
              </Text>
              <FilterChips
                options={
                  [
                    { value: 'CLASS', label: 'Class' },
                    { value: 'FREE', label: 'Free period' },
                  ] as FilterChipOption<SlotType>[]
                }
                selected={slotType}
                onSelect={(v) => {
                  setSlotType(v as SlotType);
                  if (v === 'FREE') setClassId(null);
                }}
                contentInset={0}
              />
            </View>
          </Card>
        </View>

        {/* Schedule */}
        <View style={styles.block}>
          <SectionHeader title="Schedule" divider />
          <Card>
            {/* Day */}
            <View style={styles.field}>
              <Text variant="labelMd" color={palette.onSurface}>
                Day
              </Text>
              <Button
                label={dayOfWeek ? (DAY_LABELS[dayOfWeek] ?? 'Select day') : 'Select day'}
                icon="calendar"
                variant="secondary"
                fullWidth
                onPress={() => setDaySheetOpen(true)}
              />
              {fieldErrors.day_of_week ? (
                <Text variant="labelMd" color={palette.error}>
                  {fieldErrors.day_of_week}
                </Text>
              ) : null}
            </View>

            {/* Times */}
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text variant="labelMd" color={palette.onSurface}>
                  Start time
                </Text>
                <Button
                  label={startTime ? formatMeridian(startTime) : 'Start'}
                  icon="clock"
                  variant="secondary"
                  fullWidth
                  onPress={() => setStartSheetOpen(true)}
                />
                {fieldErrors.start_time ? (
                  <Text variant="labelMd" color={palette.error}>
                    {fieldErrors.start_time}
                  </Text>
                ) : null}
              </View>
              <View style={styles.timeField}>
                <Text variant="labelMd" color={palette.onSurface}>
                  End time
                </Text>
                <Button
                  label={endTime ? formatMeridian(endTime) : 'End'}
                  icon="clock"
                  variant="secondary"
                  fullWidth
                  onPress={() => setEndSheetOpen(true)}
                />
                {fieldErrors.end_time ? (
                  <Text variant="labelMd" color={palette.error}>
                    {fieldErrors.end_time}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        </View>

        {/* Class assignment (CLASS only) */}
        {slotType === 'CLASS' && (
          <View style={styles.block}>
            <SectionHeader title="Class" divider />
            <Card>
              <View style={styles.field}>
                <Text variant="labelMd" color={palette.onSurface}>
                  Class
                </Text>
                <Button
                  label={
                    classId
                      ? (assignedClasses.find((c) => c.id === classId)?.className ?? 'Selected')
                      : 'Select class'
                  }
                  icon="classes"
                  variant="secondary"
                  fullWidth
                  disabled={assignedClasses.length === 0}
                  onPress={() => setClassSheetOpen(true)}
                />
                {fieldErrors.class_id ? (
                  <Text variant="labelMd" color={palette.error}>
                    {fieldErrors.class_id}
                  </Text>
                ) : null}
                {assignedClasses.length === 0 ? (
                  <Text variant="labelMd" color={palette.error}>
                    No classes assigned to this faculty member.
                  </Text>
                ) : null}
              </View>
            </Card>
          </View>
        )}

        {/* Break label (FREE only) */}
        {slotType === 'FREE' && (
          <View style={styles.block}>
            <SectionHeader title="Break label" divider />
            <Card>
              <Input
                label="Label (optional)"
                value={breakLabel}
                onChangeText={setBreakLabel}
                placeholder="e.g. Lunch, Tea break"
                icon="clock"
              />
            </Card>
          </View>
        )}

        {/* Room */}
        <View style={styles.block}>
          <SectionHeader title="Room" divider />
          <Card>
            <Input
              label="Room (optional)"
              value={room}
              onChangeText={setRoom}
              placeholder="e.g. Room 301"
              icon="room"
            />
          </Card>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => router.back()}
            disabled={pending}
            style={styles.action}
          />
          <Button
            label={isEdit ? 'Save changes' : 'Create slot'}
            icon="check"
            onPress={() => void submit()}
            loading={pending}
            style={styles.action}
          />
        </View>
      </Screen>

      {/* Pickers */}
      <SelectionSheet
        visible={daySheetOpen}
        title="Choose day"
        onClose={() => setDaySheetOpen(false)}
        onSelect={(id) => {
          setDayOfWeek(Number(id));
          setDaySheetOpen(false);
        }}
        options={dayOptions}
      />

      <SelectionSheet
        visible={classSheetOpen}
        title="Choose class"
        subtitle="Only classes assigned to this lecturer."
        onClose={() => setClassSheetOpen(false)}
        onSelect={(id) => {
          setClassId(id);
          setClassSheetOpen(false);
        }}
        options={classOptions}
        searchable
      />

      <SelectionSheet
        visible={startSheetOpen}
        title="Start time"
        onClose={() => setStartSheetOpen(false)}
        onSelect={(id) => {
          setStartTime(id);
          setStartSheetOpen(false);
        }}
        options={startTimeOptions}
      />

      <SelectionSheet
        visible={endSheetOpen}
        title="End time"
        subtitle={startTime ? `Must be after ${formatMeridian(startTime)}` : undefined}
        onClose={() => setEndSheetOpen(false)}
        onSelect={(id) => {
          setEndTime(id);
          setEndSheetOpen(false);
        }}
        options={endTimeOptions}
      />
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  block: {
    marginTop: spacing.md,
  },
  banner: {
    backgroundColor: palette.errorContainer,
    borderColor: palette.error,
  },
  field: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeField: {
    flex: 1,
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  action: {
    flex: 1,
  },
});
