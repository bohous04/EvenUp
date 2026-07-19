import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/auth';
import { addNotificationTapListener, registerForPushNotifications } from '@/lib/notifications';

/**
 * Registers for push on sign-in and deep-links notification taps to the group
 * they reference. Renders nothing. (Server-side token storage + delivery is a
 * backend follow-up — see notifications.ts.)
 */
export function PushRegistrar() {
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    void registerForPushNotifications();
  }, [session?.user]);

  useEffect(() => {
    return addNotificationTapListener((groupId) => router.push(`/group/${groupId}`));
  }, [router]);

  return null;
}
