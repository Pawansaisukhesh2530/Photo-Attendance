import type { AttendanceService } from '@/services/contracts';
import type {
  AttendanceHistoryQuery,
  AttendanceSession,
  AttendanceSessionSummary,
  Paginated,
  ProcessingProgress,
  TwinReview,
} from '@/types';

import { request, uploadPhoto } from './client';

/** How often processing status is polled, in ms. */
const POLL_INTERVAL_MS = 1200;

/** Query fields shared by the paged and unpaged history endpoints. */
function historyFilters(query?: AttendanceHistoryQuery) {
  return {
    classId: query?.classId,
    facultyId: query?.facultyId,
    from: query?.from,
    to: query?.to,
    status: query?.status,
    search: query?.search,
    pendingReviewOnly: query?.pendingReviewOnly,
  };
}

export const attendanceApi: AttendanceService = {
  captureAttendance: (payload) =>
    uploadPhoto<AttendanceSession>('attendance/capture', payload.photoUri, {
      // Multipart fields are strings, so the selected classes travel as a comma-separated
      // list. The server splits it and builds the candidate pool from exactly these ids.
      classIds: payload.classIds.join(','),
      capturedAt: payload.capturedAt,
    }),

  /**
   * Polls the progress endpoint until the pipeline reports DONE.
   *
   * Polling rather than websockets keeps the backend contract simple and survives the
   * app being backgrounded mid-capture, which is common when a lecturer pockets the
   * phone while the class settles. If the backend later exposes a stream, only this
   * function changes.
   */
  observeProcessing(sessionId, onProgress, onError) {
    let stopped = false;

    const poll = async (): Promise<void> => {
      if (stopped) return;
      try {
        const progress = await request<ProcessingProgress>(
          `attendance/sessions/${sessionId}/progress`,
        );
        if (stopped) return;
        onProgress(progress);
        if (progress.stage !== 'DONE') {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (!stopped) onError(error);
      }
    };

    void poll();
    return () => {
      stopped = true;
    };
  },

  retryProcessing: (sessionId) =>
    request<AttendanceSession>(`attendance/sessions/${sessionId}/retry`, { method: 'POST' }),

  getAttendanceSession: (sessionId) =>
    request<AttendanceSession>(`attendance/sessions/${sessionId}`),

  updateAttendance: ({ recordId, status, reason }) =>
    request<AttendanceSession>(`attendance/records/${recordId}`, {
      method: 'PATCH',
      body: { status, reason },
    }),

  resolveTwinReview: ({ reviewId, resolution }) =>
    request<AttendanceSession>(`attendance/twin-reviews/${reviewId}`, {
      method: 'PATCH',
      body: { resolution },
    }),

  getTwinReviews: (sessionId) =>
    request<TwinReview[]>(`attendance/sessions/${sessionId}/twin-reviews`),

  finalizeAttendance: ({ sessionId, acknowledgeUnresolvedReviews }) =>
    request<AttendanceSession>(`attendance/sessions/${sessionId}/finalize`, {
      method: 'POST',
      body: { acknowledgeUnresolvedReviews },
    }),

  getAttendanceHistory: (query) =>
    request<AttendanceSessionSummary[]>('attendance/sessions', {
      query: historyFilters(query),
    }),

  // Same resource, paged, for admin oversight.
  getPagedAttendanceHistory: (query) =>
    request<Paginated<AttendanceSessionSummary>>('attendance/sessions/paged', {
      query: { ...historyFilters(query), page: query?.page, pageSize: query?.pageSize },
    }),
};
