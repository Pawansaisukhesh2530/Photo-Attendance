import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppHeader,
  Button,
  Card,
  ClassSelectRow,
  EmptyState,
  ErrorState,
  Icon,
  SearchField,
  SkeletonListItem,
  Text,
} from '@/components';
import { useClasses } from '@/hooks/useClasses';
import { palette, radius, spacing } from '@/theme';
import type { CourseClass } from '@/types';

/**
 * Select the classes participating in this attendance session.
 *
 * One screen serves both cases by design. A single selection is ordinary single-class attendance;
 * two or more is a combined session. Separate "single" and "multi" modes would double the
 * navigation surface and force the lecturer to declare their intent before they know it — someone
 * who opens this for CSE-5A and then notices CSE-5B sitting in on the lecture should just tick a
 * second box.
 *
 * The class the lecturer arrived from is preselected and badged "This class", so the common
 * single-class path stays two taps: Take Attendance, then Continue.
 *
 * The selection made here *is* the recognition scope. It is resolved before the photo is taken
 * and travels with the capture request, so the backend can build its candidate pool from these
 * classes and never search beyond them.
 */
export default function SelectClassesScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const insets = useSafeAreaInsets();

  const { data: classes, isLoading, error, refetch } = useClasses();

  const [search, setSearch] = useState('');
  // Seeded with the originating class so the usual path needs no selection at all.
  const [selected, setSelected] = useState<string[]>(classId ? [classId] : []);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return classes ?? [];
    return (classes ?? []).filter(
      (c) =>
        c.subject.toLowerCase().includes(needle) ||
        c.displayCode.toLowerCase().includes(needle),
    );
  }, [classes, search]);

  const selectedClasses = useMemo(
    () => (classes ?? []).filter((c) => selected.includes(c.id)),
    [classes, selected],
  );

  // Approximate: the sum of enrolled counts. Presented as "students in scope" rather than a
  // headcount of the room, since some will be absent.
  const studentCount = selectedClasses.reduce((sum, c) => sum + c.studentCount, 0);

  const toggle = useCallback((item: CourseClass) => {
    setSelected((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current, item.id],
    );
  }, []);

  const handleContinue = useCallback(() => {
    if (selected.length === 0 || !classId) return;

    // Selection order is preserved; the first entry becomes the session's primary class.
    router.push({
      pathname: '/attendance/[classId]/camera',
      params: { classId, classIds: selected.join(',') },
    });
  }, [selected, classId]);

  const handleTestUpload = useCallback(() => {
    if (selected.length === 0 || !classId) return;
    router.push({
      pathname: '/attendance/[classId]/upload',
      params: { classId, classIds: selected.join(',') },
    });
  }, [selected, classId]);

  const header = (
    <AppHeader
      title="Select Classes"
      subtitle="Choose the classes in this session"
      onBack={() => router.back()}
    />
  );

  if (error) {
    return (
      <>
        {header}
        <View style={styles.centre}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </View>
      </>
    );
  }

  const listHeader = (
    <View style={styles.listHeader}>
      <Text variant="bodyMd" color={palette.onSurfaceVariant}>
        Only students in the selected classes will be identified in the photo.
      </Text>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search subject or class code"
      />

      {selected.length > 1 ? (
        <View style={styles.multiNote}>
          <Icon name="info" size={16} color={palette.primary} />
          <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.flex}>
            Combined session. Results will be grouped by class.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      {header}

      {isLoading ? (
        <View style={styles.loading}>
          <Card>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          renderItem={({ item, index }) => (
            <View style={styles.rowWrap}>
              <ClassSelectRow
                item={item}
                selected={selected.includes(item.id)}
                onToggle={toggle}
                isOrigin={item.id === classId}
                last={index === visible.length - 1}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.rowWrap}>
              <Card>
                <EmptyState
                  icon="search"
                  title="No matches"
                  message="No classes match that search."
                  actionLabel="Clear search"
                  onAction={() => setSearch('')}
                />
              </Card>
            </View>
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 160 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Sticky footer: running total plus the single forward action. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.tally}>
          <View style={styles.flex}>
            <Text variant="titleLg" color={palette.onSurface}>
              {selected.length === 0
                ? 'No classes selected'
                : `${selected.length} ${selected.length === 1 ? 'class' : 'classes'} selected`}
            </Text>
            <Text variant="bodyMd" color={palette.onSurfaceVariant}>
              {selected.length === 0
                ? 'Select at least one class to continue'
                : `${studentCount} ${studentCount === 1 ? 'student' : 'students'} in scope`}
            </Text>
          </View>

          {selected.length > 0 ? (
            <Button
              label="Clear"
              variant="ghost"
              size="sm"
              onPress={() => setSelected([])}
            />
          ) : null}
        </View>

        <Button
          label="Continue to camera"
          icon="camera"
          size="lg"
          fullWidth
          disabled={selected.length === 0}
          onPress={handleContinue}
          accessibilityHint="Opens the camera to photograph the selected classes"
        />
        <Button
          label="Upload test photo"
          icon="gallery"
          variant="secondary"
          fullWidth
          disabled={selected.length === 0}
          onPress={handleTestUpload}
          accessibilityHint="Chooses an existing photo and sends it through attendance processing"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
  },
  loading: {
    flex: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    backgroundColor: palette.surfaceContainerLow,
  },
  listContent: {
    backgroundColor: palette.surfaceContainerLow,
  },
  listHeader: {
    gap: spacing.sm,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  rowWrap: {
    marginHorizontal: spacing.screen,
    overflow: 'hidden',
  },
  multiNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.primaryFixed,
  },
  flex: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.outlineVariant,
  },
  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
