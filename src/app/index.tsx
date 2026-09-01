import { Redirect } from 'expo-router';

import { useAuthStore } from '@/store/authStore';

/**
 * Entry route. Sends the user to the right navigation tree based on session and role.
 *
 * The root layout has already finished restoring by the time this renders, so there is
 * no loading branch to handle here.
 */
export default function Index() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status !== 'authenticated' || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  return user.role === 'ADMIN' ? (
    <Redirect href="/(admin)/dashboard" />
  ) : (
    <Redirect href="/(faculty)/dashboard" />
  );
}
