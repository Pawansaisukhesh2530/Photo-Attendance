import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import { palette, radius, spacing } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * The three non-content states every data-backed screen needs.
 *
 * Kept together because they share layout and must feel like one family; a screen
 * flipping between them should only change the glyph and the words.
 */

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

export function LoadingState({ message }: { message?: string }) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={palette.primary} />
      {message ? (
        <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Empty
 * ------------------------------------------------------------------ */

export interface EmptyStateProps {
  /** Defaults to a neutral inbox glyph. */
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shown when a request succeeded and there is genuinely nothing to display.
 *
 * Deliberately restrained — no large illustration, per the brief's instruction to
 * avoid decorative filler. A muted glyph, a clear sentence, and an action if one makes
 * sense.
 */
export function EmptyState({
  icon = 'empty',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWell}>
        <Icon name={icon} size={28} color={palette.outline} />
      </View>
      <Text variant="titleLg" color={palette.onSurface} align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Error
 * ------------------------------------------------------------------ */

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/**
 * Renders a failure with the right glyph, wording and affordance for its kind.
 *
 * Only offers Retry when the error is actually retryable — a Retry button on a 403 is
 * a small lie that wastes the user's time.
 */
export function ErrorState({ error, title, message, onRetry }: ErrorStateProps) {
  const apiError = isApiError(error) ? error : null;
  const isOffline = apiError?.kind === 'OFFLINE' || apiError?.kind === 'NETWORK';
  const retryable = apiError?.retryable ?? true;

  const resolvedTitle =
    title ?? (isOffline ? 'No connection' : 'Something went wrong');

  const resolvedMessage =
    message ??
    apiError?.message ??
    'We could not load this right now. Please try again.';

  return (
    <View style={styles.container}>
      <View style={[styles.iconWell, styles.errorWell]}>
        <Icon name={isOffline ? 'offline' : 'error'} size={28} color={palette.error} />
      </View>
      <Text variant="titleLg" color={palette.onSurface} align="center">
        {resolvedTitle}
      </Text>
      <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
        {resolvedMessage}
      </Text>
      {onRetry && retryable ? (
        <Button label="Try again" icon="retry" variant="secondary" size="sm" onPress={onRetry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.outlineVariant,
    marginBottom: spacing.xs,
  },
  errorWell: {
    backgroundColor: palette.errorContainer,
    borderColor: palette.errorContainer,
  },
});
