import { StyleSheet, View } from 'react-native';

import { palette, radius, shadows, spacing } from '@/theme';

import { AnimatedOverlay } from './AnimatedOverlay';
import { Button } from './Button';
import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** `danger` for irreversible actions; `warning` for the finalize-with-open-reviews case. */
  tone?: 'default' | 'warning' | 'danger';
  icon?: IconName;
  confirmLoading?: boolean;
  /** Extra content between message and buttons — e.g. the finalize summary counts. */
  children?: React.ReactNode;
}

const TONES = {
  default: { accent: palette.primary, well: palette.primaryFixed, icon: 'info' as IconName },
  warning: { accent: palette.tertiary, well: palette.tertiaryFixed, icon: 'warning' as IconName },
  danger: { accent: palette.error, well: palette.errorContainer, icon: 'error' as IconName },
};

/**
 * Centred confirmation dialog.
 *
 * Deliberately a modal rather than a bottom sheet: a sheet can be dismissed with a
 * casual downward flick, which is exactly the accidental gesture that must not be able
 * to finalize a register. This requires a deliberate tap on a button.
 *
 * Cancel is placed first (left/top) and is the visually quieter control, so the
 * destructive or irreversible choice is never the path of least resistance.
 */
export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'default',
  icon,
  confirmLoading = false,
  children,
}: ConfirmationModalProps) {
  const tokens = TONES[tone];

  return (
    <AnimatedOverlay
      visible={visible}
      variant="center"
      onRequestClose={onCancel}
      // Backdrop tap cancels — safe, because cancelling is always the harmless choice here.
      onBackdropPress={onCancel}
      contentStyle={styles.centerInset}
    >
      <View style={[styles.dialog, shadows.raised]} accessibilityRole="alert">
          <GlassSurface intensity={88} style={StyleSheet.absoluteFill} />
          <View style={[styles.iconWell, { backgroundColor: tokens.well }]}>
            <Icon name={icon ?? tokens.icon} size={24} color={tokens.accent} />
          </View>

          <Text variant="headlineSm" color={palette.onSurface} align="center">
            {title}
          </Text>
          <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
            {message}
          </Text>

          {children ? <View style={styles.slot}>{children}</View> : null}

          <View style={styles.actions}>
            <Button
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
              style={styles.action}
            />
            <Button
              label={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={confirmLoading}
              style={styles.action}
            />
          </View>
      </View>
    </AnimatedOverlay>
  );
}

const styles = StyleSheet.create({
  centerInset: {
    paddingHorizontal: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: 'transparent',
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.outlineVariant,
    overflow: 'hidden',
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  slot: {
    width: '100%',
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
  },
});
