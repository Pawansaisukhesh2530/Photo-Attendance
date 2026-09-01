import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ConfirmationModal } from '@/components/primitives/ConfirmationModal';
import { Icon } from '@/components/primitives/Icon';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing } from '@/theme';

export interface FaceEnrolmentCardProps {
  enrolled: boolean;
  studentName: string;
}

/**
 * Face enrolment status.
 *
 * ============================================================================
 * DISPLAY ONLY. This component contains no biometric functionality whatsoever.
 *
 * It reads one boolean — `Student.faceEnrolled` — and renders a status. It does not open a camera,
 * capture an image, compute an embedding, store or upload a template, or call any biometric API.
 * There is no OpenCV, SCRFD, ArcFace or FAISS anywhere near it. Enrolment capture and template
 * extraction belong entirely to the backend that another developer will build.
 *
 * No biometric detail is ever surfaced: no vectors, no templates, no similarity scores, no model
 * metadata. A single yes/no is the whole of what this frontend knows, and the whole of what it shows.
 * ============================================================================
 *
 * The action is deliberately and visibly a stub. It opens a dialog stating that enrolment arrives
 * with the backend, rather than doing nothing silently — a button that appears to work and doesn't
 * is worse than one that says so. Faculty must not be left believing a student has been enrolled
 * when nothing happened.
 */
export function FaceEnrolmentCard({ enrolled, studentName }: FaceEnrolmentCardProps) {
  const [explaining, setExplaining] = useState(false);

  return (
    <>
      <Card>
        <View style={styles.header}>
          <View
            style={[
              styles.iconWell,
              { backgroundColor: enrolled ? palette.secondaryContainer : palette.surfaceContainerHigh },
            ]}
          >
            <Icon
              name={enrolled ? 'present' : 'person'}
              size={20}
              color={enrolled ? palette.secondary : palette.onSurfaceVariant}
            />
          </View>

          <View style={styles.headerText}>
            <Text variant="labelMd" color={palette.onSurfaceVariant}>
              FACE ENROLMENT
            </Text>
            <Text
              variant="titleLg"
              color={enrolled ? palette.secondary : palette.onSurface}
            >
              {enrolled ? 'Face enrolled' : 'Face not enrolled'}
            </Text>
          </View>
        </View>

        <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.body}>
          {enrolled
            ? 'This student can be identified in classroom photos. Enrolment is managed by the attendance service.'
            : 'This student cannot be identified automatically yet, so they will need to be marked manually after a capture.'}
        </Text>

        {!enrolled ? (
          <Button
            label="Enrol face"
            icon="person"
            variant="secondary"
            fullWidth
            onPress={() => setExplaining(true)}
            style={styles.action}
            accessibilityHint="Explains when face enrolment will become available"
          />
        ) : null}

        {/* States plainly that the frontend holds no biometric data. */}
        <View style={styles.note}>
          <Icon name="lock" size={14} color={palette.outline} />
          <Text variant="labelMd" color={palette.outline} style={styles.flex}>
            Only this status is available in the app. No biometric data is stored on the device.
          </Text>
        </View>
      </Card>

      <ConfirmationModal
        visible={explaining}
        tone="default"
        icon="info"
        title="Not available yet"
        message={`Face enrolment for ${studentName} will be available once the attendance service supports it. Nothing has been captured or saved.`}
        confirmLabel="Got it"
        cancelLabel="Close"
        onConfirm={() => setExplaining(false)}
        onCancel={() => setExplaining(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  body: {
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.md,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: palette.outlineVariant,
  },
  flex: {
    flex: 1,
  },
});
