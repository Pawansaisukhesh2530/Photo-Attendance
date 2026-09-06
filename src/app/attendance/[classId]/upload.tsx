import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import { AppHeader, Button, Card, Icon, Screen, Text } from '@/components';
import { useCaptureAttendance } from '@/hooks/useAttendanceCapture';
import { useClass } from '@/hooks/useClasses';
import { palette, radius, spacing } from '@/theme';

/**
 * Faculty testing route for environments where a classroom camera capture is unavailable.
 * The selected gallery image uses the exact same upload, recognition and results pipeline as a
 * standard camera photo, so this tests the real backend rather than a mock preview.
 */
export default function AttendanceTestUploadScreen() {
  const { classId, classIds: rawClassIds } = useLocalSearchParams<{
    classId: string;
    classIds?: string;
  }>();
  const classQuery = useClass(classId);
  const capture = useCaptureAttendance();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedClassIds = useMemo(() => {
    const values = rawClassIds?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
    return values.length > 0 ? [...new Set(values)] : classId ? [classId] : [];
  }, [classId, rawClassIds]);

  const choosePhoto = useCallback(async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) setAsset(result.assets[0]);
    } catch {
      setError('The photo library could not be opened. Please try again.');
    }
  }, []);

  const uploadPhoto = useCallback(async () => {
    if (!asset || !classId || selectedClassIds.length === 0) return;
    setError(null);
    try {
      const session = await capture.mutateAsync({
        classIds: selectedClassIds,
        captureMode: 'STANDARD',
        photos: [{ uri: asset.uri, width: asset.width, height: asset.height }],
      });
      router.replace({
        pathname: '/attendance/[classId]/processing',
        params: { classId, sessionId: session.id },
      });
    } catch (caught) {
      setError(
        isApiError(caught)
          ? caught.message
          : 'The test photo could not be uploaded. Please try again.',
      );
    }
  }, [asset, capture, classId, selectedClassIds]);

  return (
    <>
      <AppHeader
        title="Upload test photo"
        subtitle={classQuery.data?.displayCode ?? 'Faculty testing'}
        onBack={() => router.back()}
      />
      <Screen scrollable respectBottomInset={false} contentContainerStyle={styles.content}>
        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.iconWell}>
              <Icon name="gallery" size={24} color={palette.primary} />
            </View>
            <View style={styles.infoText}>
              <Text variant="titleLg" color={palette.onSurface}>
                Test without the camera
              </Text>
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Choose one existing classroom photo. It will use the live roster and the same
                backend recognition pipeline as a camera capture.
              </Text>
            </View>
          </View>
        </Card>

        {asset ? (
          <Card padded={false} style={styles.previewCard}>
            <Image source={{ uri: asset.uri }} style={styles.preview} contentFit="contain" />
            <View style={styles.previewMeta}>
              <Icon name="photo" size={18} color={palette.primary} />
              <View style={styles.infoText}>
                <Text variant="bodyLg" color={palette.onSurface} numberOfLines={1}>
                  {asset.fileName ?? 'Selected classroom photo'}
                </Text>
                <Text variant="labelMd" color={palette.onSurfaceVariant}>
                  {asset.width} × {asset.height} pixels
                </Text>
              </View>
            </View>
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <Icon name="photo" size={40} color={palette.outline} />
            <Text variant="titleLg" color={palette.onSurface} align="center">
              No test photo selected
            </Text>
            <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
              Use a clear classroom image containing students enrolled in the selected class.
            </Text>
          </Card>
        )}

        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Icon name="error" size={20} color={palette.error} />
            <Text variant="bodyMd" color={palette.error} style={styles.infoText}>
              {error}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={asset ? 'Choose another photo' : 'Choose photo from gallery'}
            icon="gallery"
            variant={asset ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            onPress={() => void choosePhoto()}
            disabled={capture.isPending}
          />
          {asset ? (
            <Button
              label="Upload and process"
              icon="forward"
              iconPosition="trailing"
              size="lg"
              fullWidth
              onPress={() => void uploadPhoto()}
              loading={capture.isPending}
            />
          ) : null}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  infoCard: {
    backgroundColor: palette.primaryFixed,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainerLowest,
  },
  infoText: {
    flex: 1,
    gap: spacing.xs,
  },
  previewCard: {
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: palette.surfaceContainerHighest,
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  emptyCard: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.errorContainer,
  },
  actions: {
    gap: spacing.sm,
  },
});
