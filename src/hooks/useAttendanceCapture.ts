import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { attendanceService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type { AttendanceCaptureMode, AttendanceSession, ProcessingProgress } from '@/types';

export function usePreparePanorama() {
  return useMutation({
    mutationFn: (sweepUri: string) =>
      attendanceService.preparePanorama({
        sweepUri,
        capturedAt: new Date().toISOString(),
      }),
  });
}

/**
 * Submits a captured photograph and opens a session.
 *
 * Media is uploaded at the resolution produced by the device. Classroom faces can occupy
 * very few pixels, especially in a panorama, so client-side resizing or JPEG recompression
 * would directly reduce recognition quality. Preview derivatives belong on the backend.
 */
export function useCaptureAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      /** The selected classes. One entry is ordinary single-class attendance. */
      classIds: string[];
      captureMode: AttendanceCaptureMode;
      photos: { uri: string; width: number; height: number }[];
      panoramaDraftId?: string;
    }): Promise<AttendanceSession> => {
      return attendanceService.captureAttendance({
        classIds: variables.classIds,
        captureMode: variables.captureMode,
        // Keep original device files. Server-side previews may be resized separately,
        // but recognition must receive the full-resolution classroom evidence.
        photoUris: variables.photos.map((photo) => photo.uri),
        panoramaDraftId: variables.panoramaDraftId,
        capturedAt: new Date().toISOString(),
      });
    },
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.attendance.session(session.id), session);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.history() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes.all });
    },
  });
}

export interface ProcessingState {
  progress: ProcessingProgress;
  isComplete: boolean;
  error: unknown;
  /** Re-runs the pipeline against the photo already uploaded. */
  retry: () => void;
  /** Stops listening. Does not delete the session. */
  cancel: () => void;
  isRetrying: boolean;
}

const INITIAL: ProcessingProgress = {
  stage: 'CAPTURED',
  progress: 0,
  detail: null,
};

/**
 * Subscribes to processing progress for a session.
 *
 * Wraps `attendanceService.observeProcessing`, which polls the backend job progress endpoint.
 *
 * On completion the session is invalidated so the results screen refetches the finished
 * record rather than reading a stale PROCESSING copy from cache.
 */
export function useProcessingProgress(sessionId: string | undefined): ProcessingState {
  const queryClient = useQueryClient();

  const [progress, setProgress] = useState<ProcessingProgress>(INITIAL);
  const [error, setError] = useState<unknown>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const resetTimer = setTimeout(() => {
      setProgress(INITIAL);
      setError(null);
      setIsComplete(false);
    }, 0);

    const unsubscribe = attendanceService.observeProcessing(
      sessionId,
      (next) => {
        setProgress(next);
        if (next.stage === 'DONE') {
          setIsComplete(true);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.attendance.session(sessionId),
          });
        }
      },
      (caught) => setError(caught),
    );

    unsubscribeRef.current = unsubscribe;

    // Always tear the subscription down. Without this, navigating away mid-capture leaves a
    // timer or poll running and setting state on an unmounted screen.
    return () => {
      clearTimeout(resetTimer);
      unsubscribe();
      unsubscribeRef.current = null;
    };
  }, [sessionId, attempt, queryClient]);

  const retry = useCallback(() => {
    if (!sessionId) return;
    setIsRetrying(true);
    void attendanceService
      .retryProcessing(sessionId)
      .then(() => setAttempt((n) => n + 1))
      .catch((caught: unknown) => setError(caught))
      .finally(() => setIsRetrying(false));
  }, [sessionId]);

  const cancel = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  return { progress, isComplete, error, retry, cancel, isRetrying };
}
