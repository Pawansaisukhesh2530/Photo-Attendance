import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useCaptureAttendance, usePreparePanorama } from '@/hooks/useAttendanceCapture';
import { useClasses } from '@/hooks/useClasses';
import { usePreferencesStore } from '@/store/preferences';
import { palette, radius, spacing, touch } from '@/theme';
import type { AttendanceCaptureMode, PanoramaPreview } from '@/types';

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
const PANORAMA_FRAME_COUNT = 7;
const PANORAMA_STEP_DEGREES = 20;
const PANORAMA_SWEEP_DEGREES = (PANORAMA_FRAME_COUNT - 1) * PANORAMA_STEP_DEGREES;
const PANORAMA_TIMEOUT_MS = 45_000;

function shortestAngleDelta(current: number, previous: number): number {
  let delta = current - previous;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

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
  const preparePanorama = usePreparePanorama();

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

  const cameraRef = useRef<CameraView>(null);
  const [captureMode, setCaptureMode] = useState<AttendanceCaptureMode>('STANDARD');
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>('preview');
  const [photos, setPhotos] = useState<CameraCapturedPicture[]>([]);
  const photo = photos[photos.length - 1] ?? null;
  const [panoramaPreview, setPanoramaPreview] = useState<PanoramaPreview | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recordingPanorama, setRecordingPanorama] = useState(false);
  const [panoramaSweepDegrees, setPanoramaSweepDegrees] = useState(0);
  const [panoramaDirection, setPanoramaDirection] = useState<-1 | 1 | null>(null);
  const [submittingPanorama, setSubmittingPanorama] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panoramaSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const panoramaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panoramaFrameUrisRef = useRef<string[]>([]);
  const panoramaLastYawRef = useRef<number | null>(null);
  const panoramaTravelRef = useRef(0);
  const panoramaDirectionRef = useRef<-1 | 1 | null>(null);
  const panoramaCaptureLockRef = useRef(false);

  const stopPanoramaSensors = useCallback((): void => {
    panoramaSubscriptionRef.current?.remove();
    panoramaSubscriptionRef.current = null;
    if (panoramaTimeoutRef.current) clearTimeout(panoramaTimeoutRef.current);
    panoramaTimeoutRef.current = null;
  }, []);

  useEffect(() => stopPanoramaSensors, [stopPanoramaSensors]);

  const handleCameraReady = useCallback(async (): Promise<void> => {
    setCameraReady(true);

    // Expo's default can vary by device. Select the sensor's largest advertised still size
    // so a distant face retains as many source pixels as the phone can provide.
    if (!cameraRef.current) return;
    try {
      const sizes = await cameraRef.current.getAvailablePictureSizesAsync();
      const largest = sizes.reduce<string | undefined>((best, candidate) => {
        const area = (value: string | undefined): number => {
          const dimensions = (value ?? '').split('x');
          const width = Number(dimensions[0]);
          const height = Number(dimensions[1]);
          return Number.isFinite(width) && Number.isFinite(height) ? width * height : 0;
        };
        return area(candidate) > area(best) ? candidate : best;
      }, undefined);
      if (largest) setPictureSize(largest);
    } catch {
      // The device default is still usable when it does not expose a size list.
    }
  }, []);

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
    selectedClasses.length > 1 ? `${scopeStudentCount} ${scopeStudentCount === 1 ? 'student' : 'students'} in scope` : null;

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

      setPhotos((current) => [...current, result].slice(0, 8));
      setPhase('captured');
    } catch {
      setError('The camera failed to take a photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing]);

  const handleRetake = useCallback((): void => {
    if (captureMode === 'PANORAMA') {
      stopPanoramaSensors();
      setPanoramaPreview(null);
      setPanoramaSweepDegrees(0);
      setPanoramaDirection(null);
    }
    else setPhotos((current) => current.slice(0, -1));
    setError(null);
    setPhase('preview');
  }, [captureMode, stopPanoramaSensors]);

  const handleContinue = useCallback(async (): Promise<void> => {
    const reviewUri = captureMode === 'PANORAMA' ? panoramaPreview?.photoUri : photo?.uri;
    if (!reviewUri || !classId) return;
    setPhase('submitting');
    setError(null);

    try {
      const session = await capture.mutateAsync({
        // The selected classes are the recognition scope and must reach the service.
        classIds: selectedClassIds,
        captureMode,
        photos: captureMode === 'PANORAMA' ? [] : photos,
        panoramaDraftId: panoramaPreview?.id,
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
  }, [captureMode, panoramaPreview, photo, photos, classId, capture, selectedClassIds]);

  const handlePanoramaCapture = useCallback(async (): Promise<void> => {
    if (
      !cameraRef.current ||
      !cameraReady ||
      !classId ||
      submittingPanorama ||
      recordingPanorama
    )
      return;

    if (Platform.OS === 'web') {
      setError('Panorama capture is available in the Android and iOS app.');
      return;
    }

    setError(null);
    setRecordingPanorama(true);
    setPanoramaSweepDegrees(0);
    setPanoramaDirection(null);
    panoramaFrameUrisRef.current = [];
    panoramaLastYawRef.current = null;
    panoramaTravelRef.current = 0;
    panoramaDirectionRef.current = null;
    panoramaCaptureLockRef.current = false;

    try {
      const available = await DeviceMotion.isAvailableAsync();
      if (!available) throw new Error('Motion sensing is not available on this device.');
      const motionPermission = await DeviceMotion.requestPermissionsAsync();
      if (!motionPermission.granted) throw new Error('Motion access is required for guided panorama capture.');

      const captureFrame = async (): Promise<void> => {
        if (panoramaCaptureLockRef.current || !cameraRef.current) return;
        panoramaCaptureLockRef.current = true;
        setCapturing(true);
        try {
          const frame = await cameraRef.current.takePictureAsync({
            quality: 0.88,
            base64: false,
            skipProcessing: Platform.OS === 'android',
          });
          if (!frame?.uri) throw new Error('A panorama view could not be saved.');
          panoramaFrameUrisRef.current.push(frame.uri);
          const count = panoramaFrameUrisRef.current.length;

          if (count >= PANORAMA_FRAME_COUNT) {
            stopPanoramaSensors();
            setRecordingPanorama(false);
            setSubmittingPanorama(true);
            try {
              const preview = await preparePanorama.mutateAsync(panoramaFrameUrisRef.current);
              setPanoramaPreview(preview);
              setPhase('captured');
            } finally {
              setSubmittingPanorama(false);
            }
          }
        } finally {
          setCapturing(false);
          panoramaCaptureLockRef.current = false;
        }
      };

      DeviceMotion.setUpdateInterval(60);
      panoramaSubscriptionRef.current = DeviceMotion.addListener((measurement) => {
        const yawRadians = measurement.rotation?.alpha;
        if (typeof yawRadians !== 'number') return;
        const yaw = (yawRadians * 180) / Math.PI;
        const previous = panoramaLastYawRef.current;
        panoramaLastYawRef.current = yaw;

        if (previous === null) {
          void captureFrame().catch((caught: unknown) => {
            stopPanoramaSensors();
            setRecordingPanorama(false);
            setError(caught instanceof Error ? caught.message : 'The panorama could not start.');
          });
          return;
        }

        panoramaTravelRef.current += shortestAngleDelta(yaw, previous);
        if (!panoramaDirectionRef.current && Math.abs(panoramaTravelRef.current) >= 4) {
          panoramaDirectionRef.current = panoramaTravelRef.current < 0 ? -1 : 1;
          setPanoramaDirection(panoramaDirectionRef.current);
        }
        const direction = panoramaDirectionRef.current;
        if (!direction) return;
        const progress = Math.max(0, panoramaTravelRef.current * direction);
        setPanoramaSweepDegrees(Math.min(PANORAMA_SWEEP_DEGREES, Math.round(progress)));
        const nextTarget = panoramaFrameUrisRef.current.length * PANORAMA_STEP_DEGREES;
        if (progress >= nextTarget && panoramaFrameUrisRef.current.length < PANORAMA_FRAME_COUNT) {
          void captureFrame().catch((caught: unknown) => {
            stopPanoramaSensors();
            setRecordingPanorama(false);
            setError(caught instanceof Error ? caught.message : 'A panorama view could not be saved.');
          });
        }
      });

      panoramaTimeoutRef.current = setTimeout(() => {
        stopPanoramaSensors();
        setRecordingPanorama(false);
        setError('The panorama sweep timed out. Retake it and rotate steadily in one direction.');
      }, PANORAMA_TIMEOUT_MS);
    } catch (caught) {
      stopPanoramaSensors();
      setRecordingPanorama(false);
      setError(
        isApiError(caught) || caught instanceof Error
          ? caught.message
          : 'The panorama sweep could not start. Please try again.',
      );
    }
  }, [
    cameraReady,
    classId,
    preparePanorama,
    submittingPanorama,
    recordingPanorama,
    stopPanoramaSensors,
  ]);

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
    const reviewingPanorama = captureMode === 'PANORAMA';
    const reviewUri = reviewingPanorama ? panoramaPreview?.photoUri : photo?.uri;

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
              {reviewingPanorama ? 'Review panorama' : 'Review photo'}
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
          source={{ uri: reviewUri ?? '' }}
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
              {reviewingPanorama
                ? 'Preparing attendance from panorama…'
                : `Uploading ${photos.length} photo${photos.length === 1 ? '' : 's'}…`}
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
                {reviewingPanorama
                  ? 'Pan across the preview and check that the whole classroom is visible.'
                  : `Photo ${photos.length} saved. Check that faces are visible and the photo is sharp.`}
              </Text>
            </View>
          )}

          <Button
            label={
              error
                ? 'Retry upload'
                : reviewingPanorama
                  ? 'Use this panorama'
                  : `Process ${photos.length} photo${photos.length === 1 ? '' : 's'}`
            }
            icon="forward"
            iconPosition="trailing"
            size="lg"
            fullWidth
            loading={busy}
            onPress={() => void handleContinue()}
            accessibilityHint="Sends the classroom capture for attendance processing"
          />

          {!reviewingPanorama ? (
            <Button
              label={photos.length < 8 ? 'Add another angle' : 'Maximum 8 photos'}
              icon="camera"
              variant="secondary"
              size="lg"
              fullWidth
              disabled={busy || photos.length >= 8}
              onPress={() => { setError(null); setPhase('preview'); }}
            />
          ) : null}

          <Button
            label={reviewingPanorama ? 'Retake panorama' : 'Retake'}
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
        mode="picture"
        pictureSize={pictureSize}
        onCameraReady={() => void handleCameraReady()}
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
            <View style={[styles.liveDot, recordingPanorama && styles.recordingDot]} />
            <Text variant="labelMd" color={palette.onSurface}>
              {recordingPanorama
                ? `${panoramaSweepDegrees}° / ${PANORAMA_SWEEP_DEGREES}°`
                : 'Live'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Layer 5 — controls, pinned above the bottom safe area */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.md }]}>
        {!recordingPanorama && !submittingPanorama ? (
          <View style={styles.modeSelector} accessibilityRole="radiogroup">
            {(['STANDARD', 'PANORAMA'] as const).map((mode) => {
              const selected = captureMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    setCaptureMode(mode);
                    setError(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.modeOption, selected && styles.modeOptionSelected]}
                >
                  <Icon
                    name={mode === 'PANORAMA' ? 'panorama' : 'camera'}
                    size={17}
                    color={selected ? palette.onPrimary : palette.surfaceContainerLowest}
                  />
                  <Text
                    variant="labelMd"
                    color={selected ? palette.onPrimary : palette.surfaceContainerLowest}
                  >
                    {mode === 'PANORAMA' ? 'Panorama' : 'Photo'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

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
                {captureMode === 'PANORAMA'
                  ? recordingPanorama
                    ? `Continue turning ${panoramaDirection === -1 ? 'left' : panoramaDirection === 1 ? 'right' : 'in either direction'} until the guide reaches the end.`
                    : 'Start at one side, tap once, then rotate slowly across the classroom.'
                  : 'Position the camera so that as many students as possible are visible.'}
              </Text>
              <Text variant="labelMd" color={palette.onPrimaryContainer}>
                {captureMode === 'PANORAMA'
                  ? recordingPanorama
                    ? 'Keep the phone level and turn from one spot. The camera records the panorama automatically.'
                    : `Hold the phone sideways and make one smooth ${PANORAMA_SWEEP_DEGREES}° sweep.`
                  : 'Hold steady, keep the whole room in frame, and avoid steep angles.'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.shutterRow}>
          <AnimatedPressable
            onPress={() =>
              void (captureMode === 'PANORAMA' ? handlePanoramaCapture() : handleCapture())
            }
            disabled={!cameraReady || capturing || recordingPanorama || submittingPanorama}
            feedback="scale"
            accessibilityRole="button"
            accessibilityLabel={
              captureMode === 'PANORAMA'
                ? 'Start guided panorama sweep'
                : 'Capture classroom photo'
            }
            accessibilityHint={
              captureMode === 'PANORAMA'
                ? `Guides one continuous ${PANORAMA_SWEEP_DEGREES} degree sweep and creates one panorama image`
                : 'Takes one photograph of the classroom'
            }
            accessibilityState={{
              disabled: !cameraReady || capturing || recordingPanorama || submittingPanorama,
            }}
            style={[
              styles.shutterRing,
              (!cameraReady || capturing || recordingPanorama || submittingPanorama) &&
                styles.shutterDisabled,
            ]}
          >
            <View
              style={[styles.shutterCore, recordingPanorama && styles.shutterCoreRecording]}
            >
              {capturing || recordingPanorama || submittingPanorama ? (
                <ActivityIndicator color={palette.onPrimary} />
              ) : (
                <Icon
                  name={
                    captureMode === 'PANORAMA' ? 'panorama' : 'camera'
                  }
                  size={32}
                  color={palette.onPrimary}
                />
              )}
            </View>
          </AnimatedPressable>
        </View>

        <Text variant="labelMd" color={palette.outline} align="center">
          {submittingPanorama
            ? 'Uploading panorama sweep…'
            : captureMode === 'PANORAMA'
              ? recordingPanorama
                ? `Pan slowly · ${Math.round((panoramaSweepDegrees / PANORAMA_SWEEP_DEGREES) * 100)}% complete`
                : 'One guided sweep creates one panorama image'
              : photos.length === 0
                ? 'Take 3–4 overlapping angles for a large classroom'
                : `${photos.length} of 8 photos captured`}
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
  recordingDot: {
    backgroundColor: palette.error,
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
  modeSelector: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(18, 18, 24, 0.72)',
  },
  modeOption: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  modeOptionSelected: {
    backgroundColor: palette.primary,
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
  shutterCoreRecording: {
    backgroundColor: palette.error,
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
