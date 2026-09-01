/**
 * Runtime configuration.
 *
 * Only values that are safe to ship inside a mobile binary belong here. Anything an
 * attacker must not have — signing keys, database credentials, the Stitch API key,
 * face-recognition model endpoints with privileged access — stays server-side. A
 * mobile app is not a trusted environment; assume every string in this file is
 * readable by anyone who downloads the app.
 */

/**
 * Flips the entire data layer between mock and real HTTP.
 *
 * This is the single switch the backend developer flips. Nothing else in the app
 * branches on it.
 */
export const USE_MOCK_API =
  process.env.EXPO_PUBLIC_USE_MOCK_API !== 'false';

/** Base URL of the REST API. Unused while USE_MOCK_API is true. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.edutrace.invalid/v1';

/** Request timeout in ms. Generous, since classroom photo upload is on the same path. */
export const API_TIMEOUT_MS = 30_000;

/** Upload timeout in ms — a classroom photo over campus wifi can be slow. */
export const UPLOAD_TIMEOUT_MS = 120_000;

/** Institutional attendance threshold, below which a student is flagged. */
export const ATTENDANCE_THRESHOLD = 75;

/**
 * Classroom photo compression targets, applied before upload.
 *
 * A full-resolution phone capture is 4-12 MB, which is wasteful over campus wifi and
 * slow to render in the results viewer. 2048px on the long edge preserves enough
 * detail for face detection at classroom distance while cutting payload by roughly an
 * order of magnitude. The backend still receives one image per session.
 */
export const PHOTO_MAX_DIMENSION = 2048;
export const PHOTO_COMPRESSION_QUALITY = 0.8;

/** Page size for virtualised rosters and history lists. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Upper bound the server will honour for `pageSize`.
 *
 * Present so a client cannot turn a paged endpoint back into an unpaged one by asking for
 * everything at once. The mock enforces it; the real backend must too.
 */
export const MAX_PAGE_SIZE = 100;
