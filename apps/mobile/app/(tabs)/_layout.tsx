import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Home, CalendarDays, Star, ShieldCheck, UserRound } from 'lucide-react-native';
import { useSession } from '@/lib/session';
import { font, palette as c } from '@/theme';

export default function TabLayout() {
  const { user, loading } = useSession();
  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><ActivityIndicator color={c.cyan} /></View>;
  if (!user) return <Redirect href="/welcome" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, height: 66, paddingTop: 6 }, tabBarActiveTintColor: c.cyan, tabBarInactiveTintColor: c.muted, tabBarLabelStyle: { fontFamily: font.body, fontSize: 10, marginBottom: 4 } }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={21} color={color} strokeWidth={1.6} /> }} />
    <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color }) => <CalendarDays size={21} color={color} strokeWidth={1.6} /> }} />
    <Tabs.Screen name="rewards" options={{ title: 'Rewards', tabBarIcon: ({ color }) => <Star size={21} color={color} strokeWidth={1.6} /> }} />
    <Tabs.Screen name="protection" options={{ title: 'Protection', tabBarIcon: ({ color }) => <ShieldCheck size={21} color={color} strokeWidth={1.6} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <UserRound size={21} color={color} strokeWidth={1.6} /> }} />
  </Tabs>;
}
