import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

export async function enablePushNotifications(): Promise<'enabled' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('appointments', { name: 'Appointments', importance: Notifications.AndroidImportance.HIGH });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  const projectId = Constants.easConfig?.projectId;
  if (!projectId) return 'unavailable';
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/me/push-token', { method: 'PUT', body: JSON.stringify({ token: token.data, platform: Platform.OS }) });
  return 'enabled';
}
