import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { addNotificationTapListener, registerForPushNotifications } from '@/lib/notifications';

/**
 * Registers this device for push on sign-in and deep-links notification taps to
 * the group they reference. Renders nothing.
 *
 * The token is uploaded to `notification.registerPushToken` — it used to be
 * fetched and thrown away, which is why the OS permission prompt appeared but
 * no push ever arrived.
 */
export function PushRegistrar() {
  const router = useRouter();
  const { data: session } = useSession();
  const registerToken = trpc.notification.registerPushToken.useMutation();

  useEffect(() => {
    if (!session?.user) return;
    void (async () => {
      // Don't spend the OS's one-shot prompt on launch: if the user has not
      // decided yet, the Settings toggle asks at a moment they'll understand.
      const token = await registerForPushNotifications(false).catch(() => null);
      if (!token) return;
      registerToken.mutate({
        token,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
      });
    })();
    // Keyed on the session alone: `registerToken` is a fresh object each render,
    // so including it would re-register on every one.
  }, [session?.user]);

  useEffect(() => {
    return addNotificationTapListener((groupId) => router.push(`/group/${groupId}`));
  }, [router]);

  return null;
}
