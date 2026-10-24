import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { api } from './api';

/** Remote push needs a real device and a development/production build (not Expo Go or web). */
export const pushSupported = () => !(Platform.OS === 'web' || !Device.isDevice || Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

/** Where the phone's notification permission stands, without asking. 'undetermined' is the only state worth explaining first. */
export async function pushPermissionState(): Promise<'granted' | 'undetermined' | 'denied' | 'unavailable'> {
  if (!pushSupported()) return 'unavailable';
  const Notifications = await import('expo-notifications');
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return current.canAskAgain && current.status === 'undetermined' ? 'undetermined' : 'denied';
}

export async function enablePushNotifications(): Promise<'enabled' | 'denied' | 'unavailable'> {
  // Expo Go does not include Android remote push support. Loading expo-notifications
  // there can throw before this function runs because its topic module is absent.
  if (Platform.OS === 'web' || !Device.isDevice || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'unavailable';
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('appointments', { name: 'Appointments', importance: Notifications.AndroidImportance.HIGH });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return 'unavailable';
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/me/push-token', { method: 'PUT', body: JSON.stringify({ token: token.data, platform: Platform.OS }) });
  return 'enabled';
}
