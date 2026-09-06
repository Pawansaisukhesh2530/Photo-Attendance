import { API_BASE_URL, API_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from '@/constants/config';
import type { ApiError, ApiErrorKind } from '@/types';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * The single HTTP boundary of the application.
 *
 * No component, screen or hook constructs a request or touches `fetch` directly.
 * Everything funnels through here so that auth headers, timeouts, and error
 * normalisation exist in exactly one place.
 */

type TokenProvider = () => string | null;
type UnauthorizedHandler = () => void;
type TokenRefresher = () => Promise<string | null>;

let getAccessToken: TokenProvider = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};
let refreshAccessToken: TokenRefresher = async () => null;
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Wired up once by the auth store at startup. Keeps the client free of any import
 * back into state, which would otherwise create a cycle.
 */
export function configureClient(options: {
  tokenProvider: TokenProvider;
  unauthorizedHandler: UnauthorizedHandler;
  tokenRefresher: TokenRefresher;
}): void {
  getAccessToken = options.tokenProvider;
  onUnauthorized = options.unauthorizedHandler;
  refreshAccessToken = options.tokenRefresher;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'retryable' in value
  );
}

function makeError(
  kind: ApiErrorKind,
  message: string,
  extra?: Partial<ApiError>,
): ApiError {
  const retryable =
    kind === 'NETWORK' ||
    kind === 'TIMEOUT' ||
    kind === 'OFFLINE' ||
    kind === 'SERVER' ||
    kind === 'UPLOAD_INTERRUPTED';

  return { kind, message, retryable, ...extra };
}

function errorKindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422 || status === 400) return 'VALIDATION';
  if (status >= 500) return 'SERVER';
  return 'UNKNOWN';
}

function toClientFieldName(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Convert FastAPI problem details and Pydantic validation arrays into safe UI strings. */
function parseErrorPayload(payload: unknown): {
  message?: string;
  fieldErrors?: Record<string, string>;
} {
  if (!payload || typeof payload !== 'object') return {};

  const value = payload as Record<string, unknown>;
  const explicitMessage = typeof value.message === 'string' ? value.message : undefined;
  const detailMessage = typeof value.detail === 'string' ? value.detail : undefined;
  const fieldErrors: Record<string, string> = {};

  if (value.fieldErrors && typeof value.fieldErrors === 'object') {
    for (const [field, error] of Object.entries(value.fieldErrors as Record<string, unknown>)) {
      if (typeof error === 'string') fieldErrors[toClientFieldName(field)] = error;
    }
  }

  let firstValidationMessage: string | undefined;
  if (Array.isArray(value.detail)) {
    for (const item of value.detail) {
      if (!item || typeof item !== 'object') continue;
      const issue = item as Record<string, unknown>;
      const message = typeof issue.msg === 'string' ? issue.msg : undefined;
      if (!message) continue;
      firstValidationMessage ??= message;

      if (Array.isArray(issue.loc)) {
        const field = [...issue.loc].reverse().find((part) => typeof part === 'string');
        if (typeof field === 'string' && field !== 'body') {
          fieldErrors[toClientFieldName(field)] = message;
        }
      }
    }
  }

  return {
    ...(explicitMessage || detailMessage || firstValidationMessage
      ? { message: explicitMessage ?? detailMessage ?? firstValidationMessage }
      : {}),
    ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
  };
}

/** Copy shown to the user. Deliberately plain, no jargon, no status codes. */
function messageForKind(kind: ApiErrorKind): string {
  switch (kind) {
    case 'OFFLINE':
      return 'You appear to be offline. Check your connection and try again.';
    case 'NETWORK':
      return 'Could not reach the server. Check your connection and try again.';
    case 'TIMEOUT':
      return 'The request took too long. Try again.';
    case 'UNAUTHORIZED':
      return 'Your session has expired. Please sign in again.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that.';
    case 'NOT_FOUND':
      return 'We could not find what you were looking for.';
    case 'CONFLICT':
      return 'This record was changed elsewhere. Reload and try again.';
    case 'VALIDATION':
      return 'Please check the highlighted fields.';
    case 'SERVER':
      return 'The server ran into a problem. Try again shortly.';
    case 'UPLOAD_INTERRUPTED':
      return 'The upload was interrupted. You can retry without retaking the photo.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  retried?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL.replace(/\/$/, '')}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function appendFilePart(
  form: FormData,
  fieldName: string,
  uri: string,
  name: string,
  type: string,
): void {
  if (Platform.OS === 'web') {
    form.append(fieldName, { uri, name, type } as unknown as Blob);
    return;
  }

  const file = new File(uri);
  if (!file.exists || file.size === 0) {
    throw makeError(
      'UPLOAD_INTERRUPTED',
      'The captured photo is no longer available. Please retake it.',
    );
  }
  form.append(fieldName, file, name);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    timeoutMs = API_TIMEOUT_MS,
    signal,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);

  // Respect a caller-supplied signal alongside our own timeout.
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  const token = getAccessToken();

  try {
    const response = await fetch(buildUrl(path, query), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const kind = errorKindForStatus(response.status);
      if (kind === 'UNAUTHORIZED' && !options.retried) {
        refreshInFlight ??= refreshAccessToken().finally(() => { refreshInFlight = null; });
        const renewed = await refreshInFlight;
        if (renewed) return request<T>(path, { ...options, retried: true });
        onUnauthorized();
      }

      let fieldErrors: Record<string, string> | undefined;
      let serverMessage: string | undefined;
      try {
        const parsed = parseErrorPayload(await response.json());
        serverMessage = parsed.message;
        fieldErrors = parsed.fieldErrors;
      } catch {
        // Non-JSON error body; fall back to our generic copy.
      }

      throw makeError(kind, serverMessage ?? messageForKind(kind), {
        status: response.status,
        ...(fieldErrors ? { fieldErrors } : {}),
      });
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (isApiError(error)) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw makeError('TIMEOUT', messageForKind('TIMEOUT'));
    }
    // In React Native a failed fetch surfaces as a generic TypeError, which covers
    // both "no connectivity" and "host unreachable". We cannot distinguish them here.
    throw makeError('NETWORK', messageForKind('NETWORK'));
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Multipart upload for the single classroom photograph.
 *
 * Separate from `request` because it needs a much longer timeout and must not
 * JSON-encode its body. Errors are normalised to UPLOAD_INTERRUPTED so the UI can
 * offer "retry upload" rather than "retake photo" — losing a classroom photo because
 * campus wifi dropped would be a genuinely bad experience.
 */
export async function uploadAttendanceMedia<T>(
  path: string,
  mediaUri: string,
  media: { fieldName: 'photo' | 'sweep'; name: string; type: 'image/jpeg' | 'video/mp4' },
  fields: Record<string, string> = {},
  onProgressUnsupported?: never,
): Promise<T> {
  void onProgressUnsupported;

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  appendFilePart(form, media.fieldName, mediaUri, media.name, media.type);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), UPLOAD_TIMEOUT_MS);
  const token = getAccessToken();

  try {
    const response = await expoFetch(buildUrl(path), {
      method: 'POST',
      body: form,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      const kind = errorKindForStatus(response.status);
      if (kind === 'UNAUTHORIZED') onUnauthorized();
      let serverMessage: string | undefined;
      let fieldErrors: Record<string, string> | undefined;
      try {
        const parsed = parseErrorPayload(await response.json());
        serverMessage = parsed.message;
        fieldErrors = parsed.fieldErrors;
      } catch {
        // The response is not JSON; use the standard message for its status.
      }
      throw makeError(kind, serverMessage ?? messageForKind(kind), {
        status: response.status,
        ...(fieldErrors ? { fieldErrors } : {}),
      });
    }

    return (await response.json()) as T;
  } catch (error) {
    if (isApiError(error)) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw makeError('TIMEOUT', 'The panorama upload took too long. Try a shorter sweep.');
    }
    throw makeError('UPLOAD_INTERRUPTED', messageForKind('UPLOAD_INTERRUPTED'));
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function uploadFiles<T>(path:string,fileUris:string[],fieldName='files'):Promise<T> {
  const form=new FormData();
  fileUris.forEach((uri,index)=>{
    const extension = (uri.split('?')[0] ?? uri).split('.').pop()?.toLowerCase() ?? '';
    const type = extension === 'png' ? 'image/png' : extension === 'heic' || extension === 'heif' ? 'image/heic' : 'image/jpeg';
    appendFilePart(form,fieldName,uri,`image-${index+1}.${extension === 'png' ? 'png' : extension === 'heic' || extension === 'heif' ? 'heic' : 'jpg'}`,type);
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), UPLOAD_TIMEOUT_MS);
  try {
    const token = getAccessToken();
    const response=await expoFetch(buildUrl(path),{method:'POST',body:form,signal:controller.signal,headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
    if(!response.ok){let detail='Upload failed.';try{detail=parseErrorPayload(await response.json()).message??detail}catch{}throw makeError(errorKindForStatus(response.status),detail,{status:response.status})}
    return response.json() as Promise<T>;
  } catch (error) {
    if (isApiError(error)) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw makeError('TIMEOUT', messageForKind('TIMEOUT'));
    throw makeError('UPLOAD_INTERRUPTED', messageForKind('UPLOAD_INTERRUPTED'));
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function downloadFile(path: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(buildUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw makeError(errorKindForStatus(response.status), messageForKind(errorKindForStatus(response.status)), { status: response.status });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const disposition = response.headers.get('content-disposition') ?? '';
  link.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'attendance-export';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Type guard used by screens to render structured API failures. */
export const createApiError = makeError;
