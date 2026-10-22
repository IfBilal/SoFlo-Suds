import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Home, CalendarDays, Star, ShieldCheck, UserRound } from 'lucide-react-native';
import { useSession } from '@/lib/session';
import { font, palette as c } from '@/theme';

export default function TabLayout() {
  const { user, loading } = useSession();
  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><ActivityIndicator color={c.cyan} /></View>;
  if (!user) return <Redirect href="/welcome" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.cyan, height: 66, paddingTop: 6 }, tabBarActiveTintColor: c.cyan, tabBarInactiveTintColor: c.muted, tabBarLabelStyle: { fontFamily: font.body, fontSize: 10, marginBottom: 4 } }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <NavIcon focused={focused}><Home size={21} color={color} strokeWidth={1.6} /></NavIcon> }} />
    <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color, focused }) => <NavIcon focused={focused}><CalendarDays size={21} color={color} strokeWidth={1.6} /></NavIcon> }} />
    <Tabs.Screen name="rewards" options={{ title: 'Rewards', tabBarIcon: ({ color, focused }) => <NavIcon focused={focused}><Star size={21} color={color} strokeWidth={1.6} /></NavIcon> }} />
    <Tabs.Screen name="protection" options={{ title: 'Protection', tabBarIcon: ({ color, focused }) => <NavIcon focused={focused}><ShieldCheck size={21} color={color} strokeWidth={1.6} /></NavIcon> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <NavIcon focused={focused}><UserRound size={21} color={color} strokeWidth={1.6} /></NavIcon> }} />
  </Tabs>;
}

function NavIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  return <View style={{ width: 60, alignItems: 'center', justifyContent: 'center' }}>{focused && <View style={{ position: 'absolute', top: -11, width: 40, height: 2, backgroundColor: c.magenta }} />}{children}</View>;
}
