import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Foreground presentation: show the banner + play a sound even while the app is
// open (PRD §4.11). Set once at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Register the device for Expo push notifications (PRD §4.11). Returns the Expo
 * push token, or null if permission was denied.
 *
 * NOTE: delivering pushes needs a server endpoint to store this token and an
 * Expo push sender in the notification service. The web app ships email digests
 * only, so that backend piece is a follow-up; this returns the token so the
 * client half is ready the moment the endpoint lands.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

/**
 * Subscribe to notification taps and hand back the `groupId` carried in the
 * notification's data payload so the app can deep-link to that group. Returns an
 * unsubscribe function.
 */
export function addNotificationTapListener(onGroup: (groupId: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { groupId?: string } | undefined;
    if (data?.groupId) onGroup(data.groupId);
  });
  return () => sub.remove();
}
