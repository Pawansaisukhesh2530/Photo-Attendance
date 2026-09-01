import { StyleSheet, View } from 'react-native';

import { palette } from '@/theme';

export interface CameraFramingGuideProps {
  /** Corner arm length in dp. */
  armLength?: number;
  thickness?: number;
  inset?: number;
}

/**
 * Classroom framing guide.
 *
 * Four corner brackets plus a light rule-of-thirds grid. The brackets read as "fit the
 * subject inside this frame", which is the established camera-viewfinder vocabulary on both
 * platforms, and the grid helps a lecturer keep the phone level and avoid the steep upward
 * angle you get holding a phone at chest height.
 *
 * Deliberately NOT rectangles that could be mistaken for face detection. There are exactly
 * four of them, they are pinned to the frame corners, and they never move — nothing here
 * tracks, follows or responds to image content. The app performs no on-device detection, and
 * this overlay must not suggest otherwise.
 *
 * Rendered with plain Views rather than SVG: it is four L-shapes and two hairlines, so SVG
 * would add a rendering layer over the camera preview for no benefit.
 */
export function CameraFramingGuide({
  armLength = 28,
  thickness = 3,
  inset = 14,
}: CameraFramingGuideProps) {
  const arm = { backgroundColor: palette.surfaceContainerLowest, borderRadius: thickness / 2 };
  const h = { height: thickness, width: armLength, ...arm };
  const v = { width: thickness, height: armLength, ...arm };

  return (
    <View style={styles.container} pointerEvents="none" accessibilityElementsHidden>
      {/* Rule-of-thirds grid, kept very low contrast so the classroom stays readable. */}
      <View style={[styles.gridLine, styles.gridV, { left: '33.333%' }]} />
      <View style={[styles.gridLine, styles.gridV, { left: '66.666%' }]} />
      <View style={[styles.gridLine, styles.gridH, { top: '33.333%' }]} />
      <View style={[styles.gridLine, styles.gridH, { top: '66.666%' }]} />

      {/* Top-left */}
      <View style={[styles.corner, { top: inset, left: inset }]}>
        <View style={h} />
        <View style={[v, styles.armDown]} />
      </View>

      {/* Top-right */}
      <View style={[styles.corner, styles.alignEnd, { top: inset, right: inset }]}>
        <View style={h} />
        <View style={[v, styles.armDown]} />
      </View>

      {/* Bottom-left */}
      <View style={[styles.corner, styles.justifyEnd, { bottom: inset, left: inset }]}>
        <View style={[v, styles.armUp]} />
        <View style={h} />
      </View>

      {/* Bottom-right */}
      <View
        style={[
          styles.corner,
          styles.alignEnd,
          styles.justifyEnd,
          { bottom: inset, right: inset },
        ]}
      >
        <View style={[v, styles.armUp]} />
        <View style={h} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
  },
  corner: {
    position: 'absolute',
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  justifyEnd: {
    justifyContent: 'flex-end',
  },
  armDown: {
    marginTop: -1,
  },
  armUp: {
    marginBottom: -1,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  gridV: {
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridH: {
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
