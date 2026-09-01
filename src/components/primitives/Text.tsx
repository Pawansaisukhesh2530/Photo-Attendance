import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { palette, typography, type TypographyRole } from '@/theme';

export interface TextProps extends RNTextProps {
  /** Role from the Stitch type scale. Defaults to `bodyMd`, Stitch's body default. */
  variant?: TypographyRole;
  /** Any palette colour. Defaults to `onSurface`. */
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

/**
 * The only text component in the app.
 *
 * Screens never reach for React Native's `Text` directly — routing everything through
 * here is what guarantees the Stitch type scale is actually applied, including the
 * correct Inter face for each weight.
 *
 * `allowFontScaling` is left at its default (true) so OS font-size settings are
 * respected; `maxFontSizeMultiplier` caps the growth so large accessibility sizes do
 * not shatter card layouts.
 */
export function Text({
  variant = 'bodyMd',
  color = palette.onSurface,
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color }, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
