import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { studentService } from '@/services';
import { palette, radius, spacing } from '@/theme';
import type { FaceImageInfo } from '@/types';

import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ConfirmationModal } from '@/components/primitives/ConfirmationModal';
import { Icon } from '@/components/primitives/Icon';
import { Text } from '@/components/primitives/Text';

export interface FaceEnrolmentCardProps {
  enrolled: boolean;
  studentName: string;
  studentId: string;
}

const statusLabel = (status: string): string => {
  if (status === 'ACCEPTED') return 'Ready';
  if (status === 'PENDING_MODEL_VALIDATION') return 'Checking';
  if (status === 'CROSS_IDENTITY_REVIEW') return 'Needs review';
  if (status === 'REJECTED') return 'Rejected';
  if (status === 'MODEL_ERROR') return 'Processing error';
  return status.replaceAll('_', ' ').toLowerCase();
};

const reasonLabel = (image: FaceImageInfo): string => {
  if (image.reason === 'EXACTLY_ONE_FACE_REQUIRED') {
    return `${image.detectedFaces ?? 0} faces found. Each enrollment photo must contain one face.`;
  }
  if (image.reason === 'IMAGE_QUALITY') return 'The face is blurred or the lighting is unsuitable.';
  if (image.reason === 'FACE_TOO_SMALL') return 'Move closer so the face fills more of the image.';
  if (image.reason === 'DUPLICATE_TEMPLATE') return 'This angle is too similar to another accepted photo.';
  if (image.reason) return image.reason.replaceAll('_', ' ').toLowerCase();
  if (image.status === 'ACCEPTED') return 'One clear face was checked and saved for recognition.';
  return 'Waiting for backend face validation.';
};

export function FaceEnrolmentCard({ enrolled, studentName, studentId }: FaceEnrolmentCardProps) {
  const [images, setImages] = useState<FaceImageInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<FaceImageInfo | null>(null);
  const [deleting, setDeleting] = useState<FaceImageInfo | null>(null);

  const load = useCallback(async () => {
    try {
      setImages(await studentService.getFaceImages(studentId));
    } catch {
      setMessage('Could not read the saved enrollment photos.');
    }
  }, [studentId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const pending = images.some((image) => image.status === 'PENDING_MODEL_VALIDATION');
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => void load(), 1400);
    return () => clearTimeout(timer);
  }, [pending, images, load]);

  const activeImages = useMemo(() => images.filter((image) => !image.revokedAt), [images]);
  const acceptedCount = activeImages.filter((image) => image.status === 'ACCEPTED').length;
  const isReady = enrolled && acceptedCount >= 3;

  const choose = async () => {
    setMessage(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 1,
    });
    if (picked.canceled) return;
    if (picked.assets.length < 1 || picked.assets.length > 5) {
      setMessage('Choose 1–5 different clear portrait photos.');
      return;
    }
    setBusy(true);
    try {
      await studentService.uploadFaceImages(
        studentId,
        picked.assets.map((asset) => asset.uri),
      );
      setMessage('Photos saved. The backend is checking every image now.');
      await load();
    } catch {
      setMessage('Could not upload these photos. Check the backend connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const reprocess = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await studentService.reprocessFaceImages(studentId);
      setMessage('Backend validation restarted.');
      await load();
    } catch {
      setMessage('Could not restart face validation.');
    } finally {
      setBusy(false);
    }
  };

  const deleteImage = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await studentService.revokeFaceImage(studentId, deleting.id);
      setDeleting(null);
      setMessage('Photo deleted from this enrollment.');
      await load();
    } catch {
      setMessage('Could not delete this photo. Check the backend connection and try again.');
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <View style={styles.header}>
        <Icon name={isReady ? 'present' : 'person'} size={20} color={palette.primary} />
        <View style={styles.flex}>
          <Text variant="labelMd" color={palette.onSurfaceVariant}>
            FACE ENROLLMENT
          </Text>
          <Text variant="titleLg">{studentName}</Text>
        </View>
      </View>

      <View style={[styles.readiness, isReady ? styles.ready : styles.notReady]}>
        <Icon
          name={isReady ? 'success' : 'warning'}
          size={18}
          color={isReady ? palette.secondary : palette.onTertiaryFixedVariant}
        />
        <Text variant="bodyMd" color={palette.onSurface} style={styles.flex}>
          {acceptedCount} of 3 required photos ready · {activeImages.length} saved in total
        </Text>
      </View>

      {activeImages.map((image, index) => {
        const ready = image.status === 'ACCEPTED';
        return (
          <View key={image.id} style={styles.imageRow}>
            <View style={[styles.numberWell, ready && styles.numberWellReady]}>
              <Text variant="labelMd" color={ready ? palette.secondary : palette.onSurfaceVariant}>
                {index + 1}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="bodyMd" color={palette.onSurface}>
                {statusLabel(image.status)} · {image.width} × {image.height}
              </Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>
                {reasonLabel(image)}
              </Text>
              <View style={styles.actions}>
                <Button label="Preview" icon="gallery" variant="ghost" size="sm" onPress={() => setPreview(image)} />
                <Button label="Delete" icon="delete" variant="ghost" size="sm" onPress={() => setDeleting(image)} />
              </View>
            </View>
          </View>
        );
      })}

      {message ? (
        <Text variant="labelMd" color={palette.primary}>
          {message}
        </Text>
      ) : null}

      <Button
        label={images.length ? 'Add 1–5 more photos' : 'Enroll face photo(s)'}
        icon="photo"
        variant="secondary"
        fullWidth
        loading={busy}
        onPress={() => void choose()}
      />
      {images.length ? (
        <Button
          label="Reprocess saved photos"
          variant="ghost"
          fullWidth
          disabled={busy}
          onPress={() => void reprocess()}
        />
      ) : null}

      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text variant="titleLg">Enrollment photo preview</Text>
              <Pressable accessibilityLabel="Close preview" onPress={() => setPreview(null)} style={styles.close}>
                <Icon name="close" size={24} color={palette.onSurface} />
              </Pressable>
            </View>
            {preview ? <Image source={{ uri: preview.imageUrl }} contentFit="contain" style={styles.previewImage} /> : null}
          </View>
        </View>
      </Modal>
      <ConfirmationModal
        visible={Boolean(deleting)}
        title="Delete enrollment photo?"
        message="This photo will no longer be used for face recognition."
        confirmLabel="Delete photo"
        onCancel={() => setDeleting(null)}
        onConfirm={() => void deleteImage()}
        confirmLoading={busy}
        tone="danger"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  readiness: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
  ready: { backgroundColor: palette.secondaryContainer },
  notReady: { backgroundColor: palette.tertiaryFixed },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.outlineVariant,
  },
  numberWell: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainerHigh,
  },
  numberWellReady: { backgroundColor: palette.secondaryContainer },
  actions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: spacing.lg },
  previewCard: { backgroundColor: palette.surface, borderRadius: radius.xl, padding: spacing.md, maxHeight: '85%' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  close: { padding: spacing.xs },
  previewImage: { width: '100%', height: 520, borderRadius: radius.lg, backgroundColor: palette.surfaceContainerHigh },
});
