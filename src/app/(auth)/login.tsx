import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Checkbox, Icon, Input, Text } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { palette, radius, shadows, spacing, useResponsive } from '@/theme';

/**
 * Sign in.
 *
 * Implements the Stitch "Login - EduTrace Pro Mobile" screen (MOBILE, 390x844):
 * centred column, 16px margins, 64px primary app mark, headline, subtitle, two
 * labelled fields, remember-me row, full-width primary action, divider and support
 * footer.
 *
 * Mobile behaviours the static Stitch screen cannot express, added here:
 *   - Keyboard avoidance, with the whole column scrollable so the password field and
 *     the Sign In button stay reachable on a small phone with the keyboard raised.
 *   - Return-key chaining from identifier to password, then submit.
 *   - Field-level error rendering driven by `ApiError.fieldErrors`.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { isExpanded } = useResponsive();
  const {
    login,
    isSubmitting,
    error,
    fieldErrors: serverFieldErrors,
    clearError,
  } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const passwordRef = useRef<TextInput>(null);

  // Local validation takes precedence; server field errors fill in anything it missed.
  const fieldErrors = { ...serverFieldErrors, ...localErrors };

  const handleSubmit = useCallback(async (): Promise<void> => {
    clearError();
    setLocalErrors({});

    // Validate locally first so an obviously incomplete form does not cost a round trip.
    const local: Record<string, string> = {};
    if (!identifier.trim()) local.identifier = 'Enter your employee ID or email.';
    if (!password) local.password = 'Enter your password.';
    if (Object.keys(local).length > 0) {
      setLocalErrors(local);
      return;
    }

    const ok = await login({ identifier: identifier.trim(), password, rememberMe });
    if (!ok) return;

    // `replace`, not `push`: the login screen must not remain on the back stack, or a
    // back gesture would return a signed-in user to it. Routing to `/` lets the index
    // route decide between the faculty and admin trees based on role.
    router.replace('/');
  }, [identifier, password, rememberMe, login, clearError]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.column, isExpanded && styles.columnExpanded]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.appMark}>
              <Icon name="appMark" size={32} color={palette.onPrimary} />
            </View>
            <Text variant="headlineLgMobile" color={palette.onSurface} align="center">
              EduTrace Pro
            </Text>
            <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
              Sign in to manage attendance and records.
            </Text>
          </View>

          {/* Form */}
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
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!isSubmitting}
              {...(fieldErrors.identifier ? { error: fieldErrors.identifier } : {})}
            />

            <Input
              ref={passwordRef}
              label="Password"
              icon="lock"
              secure
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void handleSubmit()}
              editable={!isSubmitting}
              {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
            />

            <View style={styles.optionsRow}>
              <Checkbox
                checked={rememberMe}
                onChange={setRememberMe}
                label="Remember me"
                disabled={isSubmitting}
              />
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                hitSlop={10}
                accessibilityRole="link"
                accessibilityLabel="Forgot password"
              >
                <Text variant="labelMd" color={palette.primary}>
                  Forgot password?
                </Text>
              </Pressable>
            </View>

            {/*
              Server-level failures (bad credentials, network) render above the button
              rather than against a field, because they do not belong to one input.
            */}
            {error ? (
              <View style={styles.errorBanner}>
                <Icon name="error" size={18} color={palette.onErrorContainer} />
                <Text variant="bodyMd" color={palette.onErrorContainer} style={styles.errorText}>
                  {error}
                </Text>
              </View>
            ) : null}

            <Button
              label="Sign In"
              icon="forward"
              iconPosition="trailing"
              onPress={() => void handleSubmit()}
              loading={isSubmitting}
              fullWidth
              style={styles.submit}
              accessibilityHint="Signs you in to EduTrace Pro"
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.divider} />
            <View style={styles.footerRow}>
              <Icon name="support" size={16} color={palette.onSurfaceVariant} />
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                Need access?{' '}
              </Text>
              <Pressable hitSlop={8} accessibilityRole="link">
                <Text variant="bodyMd" color={palette.primary}>
                  Contact IT Support
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screen,
  },
  column: {
    width: '100%',
  },
  columnExpanded: {
    // On a tablet the form would otherwise stretch to 1000dp+ and look absurd.
    maxWidth: 420,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  appMark: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.resting,
  },
  form: {
    gap: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: palette.errorContainer,
  },
  errorText: {
    flex: 1,
  },
  submit: {
    marginTop: spacing.sm,
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    alignSelf: 'stretch',
    backgroundColor: palette.outlineVariant,
    marginBottom: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
