import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/client';
import { AnimatedPressable, Button, CameraFramingGuide, Icon, Text } from '@/components';
import { useCaptureAttendance } from '@/hooks/useAttendanceCapture';
import { useClasses } from '@/hooks/useClasses';
import { usePreferencesStore } from '@/store/preferences';
import { palette, radius, spacing, touch } from '@/theme';

type Phase = 'preview' | 'captured' | 'submitting';

/** Shell background. Only visible behind a `contain`-fitted photo, or before the camera mounts. */
const SHELL = '#121218';

/**
 * Reserved vertical space for the overlay bands, used to inset the framing guide and size the
 * scrims. Approximations rather than measurements: the guide only needs to clear the chrome, and
 * measuring would cost a layout pass on every frame of the capture animation.
 */
const HEADER_BAND = 64;
const CONTROL_BAND = 240;
const PREVIEW_CONTROL_BAND = 220;

/**
 * Classroom capture.
 *
 * Built on `expo-camera`, derived from the Stitch "Take Attendance - Camera" screen but
 * restructured for a phone held in one hand. Stitch centres an `aspect-video` card on a light
 * page with three equal-weight buttons beneath; that reads as a web form. Here the screen goes
 * dark so the classroom is the brightest thing on it, and the layout resolves into three bands:
 * context at the top, viewfinder in the middle, one dominant action at the bottom.
 *
 * Two elements from the Stitch design are deliberately absent, and must stay absent:
 *
 *   - The animated face bounding boxes over the live feed.
 *   - The "~42 Detected" counter.
 *
 * Both assert on-device face detection. Nothing of the sort happens here — the camera's only
 * job is Capture → Preview → hand the file to the service. A UI that implies otherwise would
 * be lying to the person relying on it.
 *
 * Kept from Stitch: the primary-tinted instruction banner and its exact copy, the dark
 * viewfinder with an inset frame, the "Live" status pill, and the retake affordance.
 *
 * There is no gallery picker, on purpose. Attendance rests on the photo being of the room in
 * front of the lecturer at that moment; letting an arbitrary saved image in would quietly
 * undermine the whole record.
 */
export default function CameraScreen() {
  const { classId, classIds } = useLocalSearchParams<{
    classId: string;
    classIds?: string;
  }>();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const capture = useCaptureAttendance();

  /*
    Framing-guide preference, read live from the device store.

    Read here rather than passed in, because the camera is reached from several places and none of
    them should have to know about a presentation preference. The store is hydrated before the
    first frame of the app, so this is never briefly wrong on a cold start into the capture flow.
  */
  const showFramingGuide = usePreferencesStore((state) => state.showCameraFramingGuide);

  /**
   * The recognition scope, chosen on the previous screen.
   *
   * Falls back to the route's own class if the param is absent, so a deep link straight to the
   * camera still behaves as ordinary single-class attendance rather than capturing with an empty
   * scope.
   */
  const selectedClassIds = useMemo(() => {
    const parsed = (classIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return parsed.length > 0 ? parsed : classId ? [classId] : [];
  }, [classIds, classId]);

  const { data: allClasses } = useClasses();

  const selectedClasses = useMemo(
    () =>
      selectedClassIds
        .map((id) => (allClasses ?? []).find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [selectedClassIds, allClasses],
  );

  const course = selectedClasses[0];

  const cameraRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>('preview');
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Compact scope context.
   *
   * One class shows subject and code, as before. Several show the codes joined, because that is
   * what the lecturer needs to confirm at a glance — subjects would overflow the line. Beyond
   * three, the count stands in.
   */
  const contextLine = (() => {
    if (selectedClasses.length === 0) return 'Loading classes…';
    if (selectedClasses.length === 1) {
      const only = selectedClasses[0]!;
      return `${only.subject} • ${only.displayCode}`;
    }
    if (selectedClasses.length <= 3) {
      return selectedClasses.map((c) => c.displayCode).join(' • ');
    }
    return `${selectedClasses.length} classes`;
  })();

  const scopeStudentCount = selectedClasses.reduce((sum, c) => sum + c.studentCount, 0);

  const scopeLine =
    selectedClasses.length > 1 ? `${scopeStudentCount} students in scope` : null;

  const handleCapture = useCallback(async (): Promise<void> => {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setError(null);
    setCapturing(true);

    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 1,
        // base64 would hold a multi-megabyte string in JS memory alongside the file; the
        // compression step reads from the URI instead.
        base64: false,
        skipProcessing: Platform.OS === 'android',
      });

      if (!result?.uri) {
        setError('The photo could not be saved. Please try again.');
        return;
      }

      setPhoto(result);
      setPhase('captured');
    } catch {
      setError('The camera failed to take a photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing]);

  const handleRetake = useCallback((): void => {
    setPhoto(null);
    setError(null);
    setPhase('preview');
  }, []);

  const handleContinue = useCallback(async (): Promise<void> => {
    if (!photo || !classId) return;
    setPhase('submitting');
    setError(null);

    try {
      const session = await capture.mutateAsync({
        // The selected classes are the recognition scope and must reach the service.
        classIds: selectedClassIds,
        photoUri: photo.uri,
        width: photo.width,
        height: photo.height,
      });

      // `replace`, so a back gesture from processing cannot return to a viewfinder still
      // holding a photo that has already been submitted.
      router.replace({
        pathname: '/attendance/[classId]/processing',
        params: { classId, sessionId: session.id },
      });
    } catch (caught) {
      setPhase('captured');
      setError(
        isApiError(caught) ? caught.message : 'The photo could not be uploaded. Please try again.',
      );
    }
  }, [photo, classId, capture, selectedClassIds]);

  /* ================================================================ *
   * Permission: resolving
   * ================================================================ */

  if (!permission) {
    return (
      <View style={[styles.gateRoot, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text variant="bodyMd" color={palette.onSurfaceVariant}>
          Preparing camera…
        </Text>
      </View>
    );
  }

  /* ================================================================ *
   * Permission: not granted
   * ================================================================ */

  if (!permission.granted) {
    // `canAskAgain === false` means the OS will not show a prompt again, so Settings is the
    // only route. An "Allow" button there would appear to do nothing.
    const blocked = !permission.canAskAgain;

    return (
      <View style={[styles.gateRoot, { paddingTop: insets.top + spacing.xl }]}>
        <Animated.View entering={FadeIn.duration(220)} style={styles.gateCard}>
          <View style={[styles.gateIcon, blocked && styles.gateIconBlocked]}>
            <Icon
              name={blocked ? 'lock' : 'camera'}
              size={30}
              color={blocked ? palette.error : palette.primary}
            />
          </View>

          <Text variant="headlineLgMobile" color={palette.onSurface} align="center">
            {blocked ? 'Camera access is turned off' : 'Camera access needed'}
          </Text>

          <Text variant="bodyLg" color={palette.onSurfaceVariant} align="center">
            {blocked
              ? 'Attendance is generated from a photo of your classroom, so EduTrace Pro needs the camera. Turn it on in Settings, then come back to this screen.'
              : 'EduTrace Pro takes one photograph of your classroom to generate attendance.'}
          </Text>

          {/* Why it is needed — short, factual, and reassuring about scope. */}
          <View style={styles.gateReasons}>
            {[
              { icon: 'camera' as const, text: 'One photo per class session — nothing is recorded continuously.' },
              { icon: 'institution' as const, text: 'The photo is used only for this class register.' },
              { icon: 'edit' as const, text: 'You review and correct every student before it is saved.' },
            ].map((reason) => (
              <View key={reason.text} style={styles.gateReason}>
                <Icon name={reason.icon} size={16} color={palette.primary} />
                <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.flex}>
                  {reason.text}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.gateActions}>
            {blocked ? (
              <Button
                label="Open settings"
                icon="settings"
                size="lg"
                fullWidth
                onPress={() => {
                  void Linking.openSettings();
                  // Re-read permission when the app returns, so granting in Settings drops the
                  // user straight into a working viewfinder.
                  const sub = AppState.addEventListener('change', (next) => {
                    if (next === 'active') {
                      void requestPermission();
                      sub.remove();
                    }
                  });
                }}
              />
            ) : (
              <Button
                label="Allow camera access"
                icon="camera"
                size="lg"
                fullWidth
                onPress={() => void requestPermission()}
              />
            )}

            <Button label="Go back" variant="ghost" fullWidth onPress={() => router.back()} />
          </View>
        </Animated.View>
      </View>
    );
  }

  /* ================================================================ *
   * Captured: confirmation step
   * ================================================================ */

  if (phase === 'captured' || phase === 'submitting') {
    const busy = phase === 'submitting';

    return (
      <View style={styles.shell}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={busy ? undefined : handleRetake}
            disabled={busy}
            hitSlop={12}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Discard photo and return to the camera"
          >
            <Icon name="back" size={24} color={palette.surfaceContainerLowest} />
          </Pressable>

          <View style={styles.headerText}>
            <Text variant="titleLg" color={palette.surfaceContainerLowest} numberOfLines={1}>
              Review photo
            </Text>
            <Text variant="labelMd" color={palette.outlineVariant} numberOfLines={1}>
              {contextLine}
            </Text>
          </View>
        </View>

        {/*
          The photo fills the screen behind the overlays, mirroring the viewfinder it replaces.
          `contain` rather than `cover`: the lecturer is judging whether faces are visible, so
          cropping the edges of the frame they are about to commit would be the wrong trade.
        */}
        <Image
          source={{ uri: photo?.uri ?? '' }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={140}
          accessibilityLabel="Captured classroom photograph"
        />

        <View style={[styles.scrimTop, { height: insets.top + HEADER_BAND }]} pointerEvents="none">
          <View style={[styles.scrimBand, styles.scrimBandStrong]} />
          <View style={[styles.scrimBand, styles.scrimBandMid]} />
          <View style={[styles.scrimBand, styles.scrimBandFaint]} />
        </View>
        <View
          style={[styles.scrimBottom, { height: insets.bottom + PREVIEW_CONTROL_BAND }]}
          pointerEvents="none"
        >
          <View style={[styles.scrimBand, styles.scrimBandFaint]} />
          <View style={[styles.scrimBand, styles.scrimBandMid]} />
          <View style={[styles.scrimBand, styles.scrimBandStrong]} />
        </View>

        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator size="large" color={palette.surfaceContainerLowest} />
            <Text variant="bodyLg" color={palette.surfaceContainerLowest}>
              Uploading photo…
            </Text>
          </View>
        ) : null}

        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.md }]}>
          {error ? (
            <View style={styles.errorBanner}>
              <Icon name="error" size={18} color={palette.onErrorContainer} />
              <Text variant="bodyMd" color={palette.onErrorContainer} style={styles.flex}>
                {error}
              </Text>
            </View>
          ) : (
            <View style={styles.hint}>
              <Icon name="info" size={16} color={palette.outlineVariant} />
              <Text variant="bodyMd" color={palette.outlineVariant} style={styles.flex}>
                Check that faces are visible and the photo is sharp.
              </Text>
            </View>
          )}

          <Button
            label={error ? 'Retry upload' : 'Use this photo'}
            icon="forward"
            iconPosition="trailing"
            size="lg"
            fullWidth
            loading={busy}
            onPress={() => void handleContinue()}
            accessibilityHint="Sends the photo for attendance processing"
          />

          <Button
            label="Retake"
            icon="retake"
            variant="secondary"
            size="lg"
            fullWidth
            disabled={busy}
            onPress={handleRetake}
          />
        </View>
      </View>
    );
  }

  /* ================================================================ *
   * Live viewfinder
   * ================================================================ */

  return (
    <View style={styles.shell}>
      {/*
        Layer 1 — the camera itself, filling the entire screen.

        `absoluteFill` rather than a sized card, so the classroom is the screen rather than a
        picture on it. `CameraView` scales cover-style natively, so a 4:3 sensor on a taller
        display crops top and bottom instead of letter-boxing or stretching; the centre of the
        room, which is what matters, stays in frame.
      */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
        onMountError={() =>
          setError('The camera is unavailable on this device. Try restarting the app.')
        }
      />

      {/*
        Layer 2 — framing geometry, inset from the safe areas so brackets are never clipped.

        Suppressed entirely when the lecturer has turned the guide off in Settings, rather than
        rendered transparent: the layer is `pointerEvents="none"` decoration, so there is nothing
        to keep. The preference is presentation only — what gets captured, uploaded and recognised
        is identical either way.
      */}
      {showFramingGuide ? (
        <View
          style={[
            styles.guideLayer,
            { top: insets.top + HEADER_BAND, bottom: insets.bottom + CONTROL_BAND },
          ]}
          pointerEvents="none"
        >
          <CameraFramingGuide />
        </View>
      ) : null}

      {/* Layer 3 — scrims. Banded rather than a flat wash so the classroom stays readable. */}
      <View style={[styles.scrimTop, { height: insets.top + HEADER_BAND }]} pointerEvents="none">
        <View style={[styles.scrimBand, styles.scrimBandStrong]} />
        <View style={[styles.scrimBand, styles.scrimBandMid]} />
        <View style={[styles.scrimBand, styles.scrimBandFaint]} />
      </View>
      <View
        style={[styles.scrimBottom, { height: insets.bottom + CONTROL_BAND }]}
        pointerEvents="none"
      >
        <View style={[styles.scrimBand, styles.scrimBandFaint]} />
        <View style={[styles.scrimBand, styles.scrimBandMid]} />
        <View style={[styles.scrimBand, styles.scrimBandStrong]} />
      </View>

      {!cameraReady ? (
        <View style={styles.cameraLoading}>
          <ActivityIndicator size="large" color={palette.surfaceContainerLowest} />
        </View>
      ) : null}

      {/* Shutter flash, above everything. */}
      {capturing ? <View style={styles.flash} pointerEvents="none" /> : null}

      {/* Layer 4 — header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Close without taking attendance"
        >
          <Icon name="close" size={24} color={palette.surfaceContainerLowest} />
        </Pressable>

        <View style={styles.headerText}>
          <Text variant="titleLg" color={palette.surfaceContainerLowest} numberOfLines={1}>
            Take Attendance
          </Text>
          <Text variant="labelMd" color={palette.outlineVariant} numberOfLines={1}>
            {contextLine}
          </Text>
          {scopeLine ? (
            <Text variant="labelMd" color={palette.outline} numberOfLines={1}>
              {scopeLine}
            </Text>
          ) : null}
        </View>

        {cameraReady ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text variant="labelMd" color={palette.onSurface}>
              Live
            </Text>
          </View>
        ) : null}
      </View>

      {/* Layer 5 — controls, pinned above the bottom safe area */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.md }]}>
        {error ? (
          <View style={styles.errorBanner}>
            <Icon name="error" size={18} color={palette.onErrorContainer} />
            <Text variant="bodyMd" color={palette.onErrorContainer} style={styles.flex}>
              {error}
            </Text>
          </View>
        ) : (
          <View style={styles.instruction}>
            <Icon name="focus" size={18} color={palette.onPrimaryContainer} />
            <View style={styles.flex}>
              <Text variant="bodyMd" color={palette.onPrimaryContainer}>
                Position the camera so that as many students as possible are visible.
              </Text>
              <Text variant="labelMd" color={palette.onPrimaryContainer}>
                Hold steady, keep the whole room in frame, and avoid steep angles.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.shutterRow}>
          <AnimatedPressable
            onPress={() => void handleCapture()}
            disabled={!cameraReady || capturing}
            feedback="scale"
            accessibilityRole="button"
            accessibilityLabel="Capture classroom photo"
            accessibilityHint="Takes one photograph of the classroom"
            accessibilityState={{ disabled: !cameraReady || capturing }}
            style={[
              styles.shutterRing,
              (!cameraReady || capturing) && styles.shutterDisabled,
            ]}
          >
            <View style={styles.shutterCore}>
              {capturing ? (
                <ActivityIndicator color={palette.onPrimary} />
              ) : (
                <Icon name="camera" size={32} color={palette.onPrimary} />
              )}
            </View>
          </AnimatedPressable>
        </View>

        <Text variant="labelMd" color={palette.outline} align="center">
          One photo is all that is needed
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: SHELL,
  },
  flex: {
    flex: 1,
  },

  /* Header */
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    width: touch.comfortable,
    height: touch.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(252, 248, 255, 0.9)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: palette.secondary,
  },

  /* Full-bleed layers */
  guideLayer: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
  },
  cameraLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(18, 18, 24, 0.65)',
  },

  /*
   * Scrims.
   *
   * Three stacked translucent bands approximate a gradient without pulling in
   * `expo-linear-gradient` for two decorative fades. Kept light — the brief is explicit that the
   * classroom must not become hard to see, so the strongest band is only 55% and sits behind text
   * rather than over the room.
   */
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  scrimBand: {
    flex: 1,
  },
  scrimBandStrong: {
    backgroundColor: 'rgba(18, 18, 24, 0.55)',
  },
  scrimBandMid: {
    backgroundColor: 'rgba(18, 18, 24, 0.3)',
  },
  scrimBandFaint: {
    backgroundColor: 'rgba(18, 18, 24, 0.1)',
  },

  /* Controls */
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  instruction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.primaryContainer,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.errorContainer,
  },
  shutterRow: {
    alignItems: 'center',
  },
  shutterRing: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(252, 248, 255, 0.55)',
    backgroundColor: 'rgba(252, 248, 255, 0.12)',
  },
  shutterCore: {
    width: 66,
    height: 66,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  shutterDisabled: {
    opacity: 0.45,
  },
  shutterPressed: {
    transform: [{ scale: 0.93 }],
  },

  /* Permission gate */
  gateRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: palette.surface,
  },
  gateCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: spacing.sm,
  },
  gateIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryFixed,
    marginBottom: spacing.sm,
  },
  gateIconBlocked: {
    backgroundColor: palette.errorContainer,
  },
  gateReasons: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainerLow,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  gateReason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  gateActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
