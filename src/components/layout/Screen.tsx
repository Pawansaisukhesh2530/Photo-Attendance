import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, spacing, useResponsive } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Use `false` for screens owning a FlatList. */
  scrollable?: boolean;
  /** Applies the responsive horizontal margin. Disable for edge-to-edge camera screens. */
  padded?: boolean;
  background?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Respects the bottom safe area. Turn off when a tab bar already handles it. */
  respectBottomInset?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Safe-area-aware screen container.
 *
 * Every screen sits inside one of these. It centralises three things that are easy to
 * get subtly wrong per-screen:
 *
 *   - Safe areas. Handled with insets rather than SafeAreaView so the background can
 *     still bleed under the status bar while content stays clear of notches, Dynamic
 *     Island, and the Android navigation bar.
 *   - Horizontal margin. Stitch `margin-mobile` (16) on phones, `gutter` (24) on
 *     tablets, from `useResponsive`.
 *   - Max content width on tablets. Text lines spanning a 12-inch iPad are unreadable,
 *     so content is capped and centred rather than stretched.
 *
 * The top inset is deliberately not applied here — headers own it, so a header's
 * background can extend behind the status bar.
 */
export function Screen({
  children,
  scrollable = false,
  padded = true,
  background = 'transparent',
  onRefresh,
  refreshing = false,
  respectBottomInset = true,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { screenPadding, isExpanded } = useResponsive();

  const contentStyle: StyleProp<ViewStyle> = [
    padded && { paddingHorizontal: screenPadding },
    isExpanded && styles.constrained,
    respectBottomInset && { paddingBottom: insets.bottom + spacing.md },
    contentContainerStyle,
  ];

  if (scrollable) {
    return (
      <View style={[styles.root, { backgroundColor: background }, style]} testID={testID}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: background }, style]} testID={testID}>
      <View style={[styles.flex, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  constrained: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
});
