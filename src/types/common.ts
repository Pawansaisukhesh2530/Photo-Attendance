/** Shared primitives used across every API contract. */

/** ISO-8601 timestamp string, e.g. "2026-08-27T09:15:00Z". */
export type IsoDateTime = string;

/** ISO-8601 calendar date with no time component, e.g. "2026-08-27". */
export type IsoDate = string;

/** Opaque server-generated identifier. Never parsed or constructed client-side. */
export type Id = string;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

/**
 * Normalised failure shape. Every transport-level error is converted into this by
 * `api/client.ts`, so UI code never sees a raw fetch rejection and can switch on
 * `kind` to choose between an inline retry, a permission prompt, or a full
 * ErrorState screen.
 */
export type ApiErrorKind =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'SERVER'
  | 'UPLOAD_INTERRUPTED'
  | 'UNKNOWN';

export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  /** HTTP status, when the failure reached the server at all. */
  status?: number;
  /** Field-level messages for VALIDATION failures, keyed by field name. */
  fieldErrors?: Record<string, string>;
  /** True when retrying the identical request could plausibly succeed. */
  retryable: boolean;
}

/**
 * Normalised rectangle for a detected face, expressed as fractions of the source
 * image (0..1) rather than pixels.
 *
 * Rationale for the backend team: the frontend displays the classroom photo at
 * whatever size the device allows and may show a downscaled copy, so absolute pixel
 * coordinates would force the client to know the original image dimensions and
 * rescale. Fractional coordinates survive any resize. Origin is top-left.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
