import { useEffect } from 'react';
import { router } from 'expo-router';
import { pushSupported } from '@/lib/push';
import { routeForDeepLink } from '@/lib/pushRouting';

/** Shows notifications while the app is open and opens the right screen when one is tapped. */
export function PushTapHandler() {
  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false; let remove: (() => void) | undefined;
    (async () => {
      const Notifications = await import('expo-notifications');
      Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
      const open = (response: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => {
        const path = routeForDeepLink(response.notification.request.content.data?.deepLink);
        if (path) router.push(path as never);
      };
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last && !cancelled) open(last);
      const sub = Notifications.addNotificationResponseReceivedListener(open);
      remove = () => sub.remove();
    })().catch(() => {});
    return () => { cancelled = true; remove?.(); };
  }, []);
  return null;
}
