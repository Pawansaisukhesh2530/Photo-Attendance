import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Icon } from '@/components/primitives/Icon';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, statusColors } from '@/theme';
import type { AttendanceRecord, DetectedFace } from '@/types';

export interface ClassroomPhotoViewerProps {
  photoUri: string | null;
  photoWidth?: number | null;
  photoHeight?: number | null;
  records: AttendanceRecord[];
  /** Every backend detection, including faces that did not match the selected roster. */
  detections?: DetectedFace[];
  /** Highlights one record's box, e.g. when opened from a roster row. */
  focusedRecordId?: string | null;
  onSelectRecord?: (record: AttendanceRecord) => void;
  /** Hides overlays entirely — used for the capture preview before processing. */
  showBoxes?: boolean;
  caption?: string;
}

/**
 * The captured classroom photograph, with optional recognition overlays.
 *
 * Boxes are drawn from `record.faceBox`, which the backend supplies as fractions of the
 * source image (0..1). Fractional coordinates are what make this work: the photo renders at
 * whatever width the device allows, and absolute pixels would need the client to know the
 * original dimensions and rescale on every layout change.
 *
 * ============================================================================
 * NO DETECTION HAPPENS HERE. This component draws rectangles it was handed. It
 * does not analyse the image. Those rectangles come from the backend
 * service; later they will come from the backend. The code path is identical.
 * ============================================================================
 *
 * Boxes are tappable so a lecturer can go from a face in the photo to the roster row, which
 * is the natural direction when someone is visibly present but marked otherwise.
 */
export function ClassroomPhotoViewer({
  photoUri,
  photoWidth,
  photoHeight,
  records,
  detections = [],
  focusedRecordId = null,
  onSelectRecord,
  showBoxes = true,
  caption,
}: ClassroomPhotoViewerProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const handleLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const withBoxes = records.filter((r) => r.faceBox !== null);
  const visibleDetections =
    detections.length > 0
      ? detections
      : withBoxes.map((record) => ({
          id: record.id,
          imageId: '',
          box: record.faceBox!,
          confidence: record.confidence ?? 0,
          matchStatus: 'MATCHED' as const,
          matchedStudentId: record.studentId,
        }));
  const sourceAspectRatio =
    photoWidth && photoHeight && photoWidth > 0 && photoHeight > 0
      ? photoWidth / photoHeight
      : 4 / 3;

  return (
    <View style={styles.container}>
      <View style={[styles.frame, { aspectRatio: sourceAspectRatio }]} onLayout={handleLayout}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.image}
            contentFit="contain"
            transition={200}
            cachePolicy="memory-disk"
            accessibilityLabel="Captured classroom photograph"
          />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="photo" size={28} color={palette.outlineVariant} />
            <Text variant="labelMd" color={palette.inverseOnSurface}>
              Photo unavailable
            </Text>
          </View>
        )}

        {/* Recognition overlays. */}
        {showBoxes && !previewMode && size
          ? visibleDetections.map((detection) => {
              const record = records.find((item) => item.studentId === detection.matchedStudentId);
              const box = detection.box;
              const tokens = statusColors[record?.status ?? (detection.matchStatus === 'REVIEW' ? 'REVIEW' : 'UNKNOWN')];
              const isFocused = record ? focusedRecordId === record.id : false;

              return (
                <Pressable
                  key={detection.id}
                  onPress={record && onSelectRecord ? () => onSelectRecord(record) : undefined}
                  disabled={!record || !onSelectRecord}
                  accessibilityRole={record && onSelectRecord ? 'button' : 'image'}
                  accessibilityLabel={record ? `${record.rollNumber || record.studentName}, ${record.status.toLowerCase()}` : 'Unknown face'}
                  style={[
                    styles.box,
                    {
                      left: box.x * size.width,
                      top: box.y * size.height,
                      width: box.width * size.width,
                      height: box.height * size.height,
                      borderColor: tokens.accent,
                      backgroundColor: isFocused ? `${tokens.accent}33` : 'transparent',
                      borderWidth: isFocused ? 3 : 2,
                    },
                  ]}
                >
                  {record ? (
                    <View style={[styles.boxLabel, { backgroundColor: tokens.accent }]}>
                      <Text variant="labelMd" color={palette.onPrimary} numberOfLines={1}>
                        {record.rollNumber || record.studentName}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.boxLabel, { backgroundColor: tokens.accent }]}>
                      <Text variant="labelMd" color={palette.onPrimary}>Unknown face</Text>
                    </View>
                  )}
                </Pressable>
              );
            })
          : null}

        {caption ? (
          <View style={styles.caption}>
            <Icon name="camera" size={14} color={palette.inverseOnSurface} />
            <Text variant="labelMd" color={palette.inverseOnSurface} numberOfLines={1}>
              {caption}
            </Text>
          </View>
        ) : null}
      </View>

      {showBoxes ? (
        <Button
          label={previewMode ? 'Show detections' : 'Preview photo'}
          icon={previewMode ? 'recognition' : 'gallery'}
          variant="ghost"
          size="sm"
          onPress={() => setPreviewMode((value) => !value)}
        />
      ) : null}

      {showBoxes && !previewMode ? (
        <View style={styles.detectedSummary}>
          <Icon name="recognition" size={18} color={palette.primary} />
          <Text variant="bodyMd" color={palette.onSurface}>
            {visibleDetections.length} {visibleDetections.length === 1 ? 'face' : 'faces'} detected
          </Text>
          {visibleDetections.length > 0 ? (
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              · {visibleDetections.filter((face) => face.matchStatus === 'MATCHED').length} matched
            </Text>
          ) : null}
        </View>
      ) : null}

      {showBoxes && !previewMode && visibleDetections.length > 0 ? (
        <View style={styles.legend}>
          {(['PRESENT', 'REVIEW', 'UNKNOWN'] as const).map((status) => (
            <View key={status} style={styles.legendItem}>
              <View
                style={[styles.legendSwatch, { borderColor: statusColors[status].accent }]}
              />
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </Text>
            </View>
          ))}
          <Text variant="labelMd" color={palette.outline}>
            Tap a box to open the student
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  frame: {
    width: '100%',
    // 4:3, the aspect ratio of a still capture from most phone cameras.
    aspectRatio: 4 / 3,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: palette.inverseSurface,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  box: {
    position: 'absolute',
    borderRadius: radius.base,
  },
  boxLabel: {
    position: 'absolute',
    top: 2,
    left: 2,
    paddingHorizontal: spacing.xs + 1,
    paddingVertical: 1,
    borderRadius: radius.base,
  },
  detectedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  caption: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    // Stitch overlays a translucent scrim behind photo captions.
    backgroundColor: 'rgba(48, 47, 57, 0.72)',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 2,
  },
});
