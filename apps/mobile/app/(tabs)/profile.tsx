import { router } from 'expo-router';
import { Alert, Linking, View } from 'react-native';
import { CreditCard, Bell, Phone, FileText, LogOut, CarFront, Trash2, UserRound } from 'lucide-react-native';
import { BrandText, Card, RowLink, Screen } from '@/components/BrandUI';
import { useSession } from '@/lib/session';
import { palette as c } from '@/theme';

export default function ProfileScreen() {
  const { user, signOut } = useSession();
  return <Screen title="Your SoFlo, your way." subtitle="Your details and preferences.">
    <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.magenta, alignItems: 'center', justifyContent: 'center' }}><BrandText style={{ fontWeight: '700' }}>{user?.name?.slice(0, 2).toUpperCase()}</BrandText></View><View><BrandText style={{ fontSize: 19, fontWeight: '600' }}>{user?.name}</BrandText><BrandText muted>{user?.email}</BrandText></View></View></Card>
    <Card style={{ marginTop: 16 }}><RowLink icon={<UserRound size={19} color={c.cyan} />} title="Edit details" onPress={() => router.push('/edit-profile' as never)} /><RowLink icon={<CarFront size={19} color={c.cyan} />} title="My vehicles" onPress={() => router.push('/vehicles')} /><RowLink icon={<CreditCard size={19} color={c.cyan} />} title="Payment history" onPress={() => router.push('/payments' as never)} /><RowLink icon={<Bell size={19} color={c.cyan} />} title="Notification preferences" onPress={() => router.push('/notifications')} /><RowLink icon={<Phone size={19} color={c.cyan} />} title="Contact shop" onPress={() => router.push('/contact' as never)} /><RowLink icon={<FileText size={19} color={c.cyan} />} title="Privacy policy" onPress={() => router.push('/privacy' as never)} /></Card>
    <Card style={{ marginTop: 16 }}><RowLink icon={<Trash2 size={19} color={c.magenta} />} title="Delete account" onPress={() => router.push('/delete-account' as never)} /><RowLink icon={<LogOut size={19} color={c.cyan} />} title="Log out" onPress={() => Alert.alert('Log out?', 'You can sign in again any time.', [{ text: 'Stay', style: 'cancel' }, { text: 'Log out', onPress: () => { signOut().then(() => router.replace('/welcome')); } }])} /></Card>
  </Screen>;
}
