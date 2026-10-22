import { Alert } from 'react-native';
import { router } from 'expo-router';
import { BrandText, Button, Card, Screen } from '@/components/BrandUI';
import { api, clearSession } from '@/lib/api';
import { palette as c } from '@/theme';
export default function DeleteAccount() { async function remove() { try { await api('/me', { method: 'DELETE' }); await clearSession(); router.replace('/welcome'); } catch (e) { Alert.alert('Could not delete account', e instanceof Error ? e.message : 'Please try again.'); } } return <Screen title="Delete your account." subtitle="This action cannot be undone."><Card><BrandText muted>Deleting your account removes access to your SoFlo Suds profile and anonymizes your app account. Your service and payment records remain with the shop in Urable as required for business records.</BrandText><Button label="Delete my account" variant="outline" onPress={() => Alert.alert('Delete account?', 'Your app account will be permanently closed.', [{ text: 'Keep account', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: remove }])} style={{ marginTop: 20, borderColor: c.magenta }} /></Card></Screen>; }
