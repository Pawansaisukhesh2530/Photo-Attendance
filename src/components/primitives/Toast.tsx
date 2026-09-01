import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, shadows, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * Toast notifications.
 *
 * Used for the confirmation the brief requires after saving an attendance edit. Sits
 * above the tab bar rather than at the top of the screen, because on a phone the
 * bottom is where the user's attention and thumb already are.
 */

export type ToastTone = 'success' | 'error' | 'info';

interface ToastOptions {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONES: Record<ToastTone, { background: string; foreground: string; icon: IconName }> = {
  success: {
    background: palette.secondary,
    foreground: palette.onSecondary,
    icon: 'success',
  },
  error: {
    background: palette.error,
    foreground: palette.onError,
    icon: 'error',
  },
  info: {
    background: palette.inverseSurface,
    foreground: palette.inverseOnSurface,
    icon: 'info',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { tone: ToastTone }) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    ({ message, tone = 'success', durationMs = 2800 }: ToastOptions) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ message, tone, durationMs });
      // Screen readers do not announce a newly mounted view, so announce explicitly.
      AccessibilityInfo.announceForAccessibility(message);
      timerRef.current = setTimeout(() => setToast(null), durationMs);
    },
    [],
  );

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(140)}
          pointerEvents="none"
          style={[
            styles.wrapper,
            { bottom: insets.bottom + spacing.xl + spacing.lg },
          ]}
        >
          <View
            style={[
              styles.toast,
              { backgroundColor: TONES[toast.tone].background },
              shadows.raised,
            ]}
            accessibilityLiveRegion="polite"
          >
            <Icon name={TONES[toast.tone].icon} size={18} color={TONES[toast.tone].foreground} />
            <Text
              variant="bodyMd"
              color={TONES[toast.tone].foreground}
              style={styles.message}
            >
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return context;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 480,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
  },
  message: {
    flexShrink: 1,
  },
});
