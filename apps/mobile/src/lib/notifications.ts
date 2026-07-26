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
 * The caller is responsible for handing the token to
 * `notification.registerPushToken` — without that the server has nothing to
 * send to. `PushRegistrar` does this on sign-in.
 *
 * @param promptIfNeeded when false, an undecided permission is left alone and
 * this resolves to null. The OS only ever shows its prompt once, so the
 * settings toggle asks explicitly rather than spending it on app launch.
 */
export async function registerForPushNotifications(
  promptIfNeeded = true,
): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    if (!promptIfNeeded) return null;
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
/** Whether the OS has already granted notification permission. */
export async function hasPushPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  return settings.granted;
}

export function addNotificationTapListener(onGroup: (groupId: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { groupId?: string } | undefined;
    if (data?.groupId) onGroup(data.groupId);
  });
  return () => sub.remove();
}
