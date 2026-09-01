import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/client';
import {
  Button,
  Card,
  ClassroomPhotoViewer,
  ConfirmationModal,
  Icon,
  ProcessingStepper,
  Text,
} from '@/components';
import { useAttendanceSession } from '@/hooks/useAttendance';
import { useProcessingProgress } from '@/hooks/useAttendanceCapture';
import { palette, radius, spacing } from '@/theme';
import { formatTime } from '@/utils/datetime';

/**
 * Mock AI processing.
 *
 * Shows meaningful staged progress rather than a bare spinner: the captured photo above, the
 * seven-step stepper below, and a determinate percentage. Adapted from the Stitch AI
 * Processing screen, whose desktop split-pane (7/12 image beside 5/12 steps) becomes a single
 * scrolling column.
 *
 * ============================================================================
 * The progress shown here is a scripted simulation of a BACKEND pipeline. This
 * screen performs no image analysis. The photograph is displayed and nothing more.
 * ============================================================================
 *
 * Back navigation is intentionally disabled at the layout level for this route. The escape
 * hatch is an explicit Cancel with confirmation, so a stray swipe cannot abandon a capture
 * of a classroom that has since emptied.
 */
export default function ProcessingScreen() {
  const { classId, sessionId } = useLocalSearchParams<{
    classId: string;
    sessionId: string;
  }>();
  const insets = useSafeAreaInsets();

  const { data: session } = useAttendanceSession(sessionId);
  const { progress, isComplete, error, retry, cancel, isRetrying } =
    useProcessingProgress(sessionId);

  const [confirmCancel, setConfirmCancel] = useState(false);

  // Advance automatically once the pipeline reports DONE. `replace` keeps processing off the
  // back stack — returning to a finished progress bar would be a dead end.
  useEffect(() => {
    if (!isComplete || !sessionId || !classId) return;

    const timer = setTimeout(() => {
      router.replace({
        pathname: '/attendance/[classId]/results',
        params: { classId, sessionId },
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [isComplete, sessionId, classId]);

  const failed = error !== null;
  const retryable = isApiError(error) ? error.retryable : true;

  const friendlyMessage = isApiError(error)
    ? error.message
    : 'Processing could not be completed. Please try again.';

  const handleCancel = (): void => {
    cancel();
    setConfirmCancel(false);
    router.dismissAll();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="headlineLgMobile" color={palette.onSurface}>
            {failed ? 'Processing stopped' : 'Analysing attendance'}
          </Text>
          <Text variant="bodyMd" color={palette.onSurfaceVariant}>
            {failed
              ? 'Your photo is saved. Nothing has been recorded yet.'
              : `${session?.className ?? 'Class'} · ${session?.classDisplayCode ?? ''}`}
          </Text>
        </View>

        {/* Captured photo. Overlays are off — no results exist yet. */}
        <ClassroomPhotoViewer
          photoUri={session?.photoUri ?? null}
          records={[]}
          showBoxes={false}
          caption={
            session?.capturedAt
              ? `Captured ${formatTime(session.capturedAt)}`
              : 'Classroom capture'
          }
        />

        {/* Failure */}
        {failed ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <View style={styles.errorIcon}>
                <Icon name="error" size={22} color={palette.error} />
              </View>
              <Text variant="titleLg" color={palette.onSurface} style={styles.flexText}>
                We could not finish
              </Text>
            </View>

            <Text variant="bodyMd" color={palette.onSurfaceVariant}>
              {friendlyMessage}
            </Text>

            <View style={styles.errorActions}>
              {retryable ? (
                <Button
                  label="Retry processing"
                  icon="retry"
                  fullWidth
                  loading={isRetrying}
                  onPress={retry}
                />
              ) : null}
              <Button
                label="Retake photo"
                icon="camera"
                variant="secondary"
                fullWidth
                onPress={() =>
                  router.replace({
                    pathname: '/attendance/[classId]/camera',
                    params: { classId },
                  })
                }
              />
              <Button
                label="Cancel"
                variant="ghost"
                fullWidth
                onPress={() => setConfirmCancel(true)}
              />
            </View>
          </Card>
        ) : null}

        {/* Stepper */}
        <Card>
          <ProcessingStepper
            stage={progress.stage}
            progress={progress.progress}
            detail={progress.detail}
            failed={failed}
          />
        </Card>

        {/* Reassurance while waiting. */}
        {!failed ? (
          <View style={styles.note}>
            <Icon name="info" size={18} color={palette.primary} />
            <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flexText}>
              Attendance is generated on the server. You will be able to review and correct
              every student before anything is recorded.
            </Text>
          </View>
        ) : null}

        {!failed ? (
          <Button
            label="Cancel"
            icon="close"
            variant="secondary"
            fullWidth
            onPress={() => setConfirmCancel(true)}
            style={styles.cancelButton}
          />
        ) : null}
      </ScrollView>

      <ConfirmationModal
        visible={confirmCancel}
        tone="danger"
        icon="close"
        title="Cancel this capture?"
        message="The photo will be discarded and no attendance will be recorded for this session."
        confirmLabel="Discard capture"
        cancelLabel="Keep processing"
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
  },
  content: {
    paddingHorizontal: spacing.screen,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  errorCard: {
    gap: spacing.sm,
    borderColor: palette.error,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.errorContainer,
  },
  errorActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainer,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  flexText: {
    flex: 1,
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
