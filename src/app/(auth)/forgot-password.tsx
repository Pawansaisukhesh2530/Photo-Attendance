import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/client';
import { AppHeader, Button, Icon, Input, Text } from '@/components';
import { useRequestPasswordReset } from '@/hooks/useAuth';
import { palette, radius, spacing, useResponsive } from '@/theme';

/**
 * Reset password.
 *
 * Stitch has no screen for this flow, so it extends the language established by the
 * generated Stitch mobile login: same 16px margins, same 48px controls, same labelled
 * field treatment, same full-width primary action. The app mark is replaced by a
 * smaller 56px tonal icon well, since this screen is a task rather than an entry point.
 *
 * Two states: the form, and a confirmation after submission. The confirmation is
 * deliberately worded so it does not reveal whether the identifier exists — telling an
 * unauthenticated caller "no such account" hands them a way to enumerate valid staff
 * IDs.
 */
export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { isExpanded } = useResponsive();
  const { mutateAsync, isPending } = useRequestPasswordReset();

  const [identifier, setIdentifier] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(async (): Promise<void> => {
    setFieldError(null);

    if (!identifier.trim()) {
      setFieldError('Enter your employee ID or email.');
      return;
    }

    try {
      await mutateAsync({ identifier: identifier.trim() });
      setSubmitted(true);
    } catch (caught) {
      if (isApiError(caught)) {
        setFieldError(caught.fieldErrors?.identifier ?? caught.message);
      } else {
        setFieldError('Could not send the reset link. Please try again.');
      }
    }
  }, [identifier, mutateAsync]);

  return (
    <View style={styles.root}>
      <AppHeader title="Reset password" onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.column, isExpanded && styles.columnExpanded]}>
            <View style={styles.header}>
              <View style={[styles.iconWell, submitted && styles.iconWellSuccess]}>
                <Icon
                  name={submitted ? 'success' : 'passwordReset'}
                  size={26}
                  color={submitted ? palette.secondary : palette.primary}
                />
              </View>

              <Text variant="headlineLgMobile" color={palette.onSurface} align="center">
                {submitted ? 'Check your email' : 'Forgot your password?'}
              </Text>

              <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
                {submitted
                  ? `If an account matches ${identifier.trim()}, a reset link is on its way. The link expires in 30 minutes.`
                  : 'Enter your employee ID or institutional email and we will send you a reset link.'}
              </Text>
            </View>

            {submitted ? (
              <View style={styles.form}>
                <Button
                  label="Back to sign in"
                  onPress={() => router.replace('/(auth)/login')}
                  fullWidth
                />
                <Button
                  label="Use a different ID"
                  variant="ghost"
                  onPress={() => {
                    setSubmitted(false);
                    setIdentifier('');
                  }}
                  fullWidth
                />
              </View>
            ) : (
              <View style={styles.form}>
                <Input
                  label="Employee ID / Email"
                  icon="person"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="e.g. emp_12345 or email@institution.edu"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  keyboardType="email-address"
                  returnKeyType="go"
                  onSubmitEditing={() => void handleSubmit()}
                  editable={!isPending}
                  {...(fieldError ? { error: fieldError } : {})}
                />

                <Button
                  label="Send reset link"
                  onPress={() => void handleSubmit()}
                  loading={isPending}
                  fullWidth
                  style={styles.submit}
                />

                <Button
                  label="Back to sign in"
                  variant="ghost"
                  onPress={() => router.back()}
                  fullWidth
                />
              </View>
            )}

            <View style={styles.note}>
              <Icon name="info" size={18} color={palette.primary} />
              <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.noteText}>
                If you do not receive an email within a few minutes, contact IT Support.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.xl,
  },
  column: {
    width: '100%',
    flex: 1,
  },
  columnExpanded: {
    maxWidth: 420,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: palette.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconWellSuccess: {
    backgroundColor: palette.secondaryContainer,
  },
  form: {
    gap: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: 'auto',
    marginBottom: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: palette.outlineVariant,
  },
  noteText: {
    flex: 1,
  },
});
