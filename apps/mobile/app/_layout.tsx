import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '@/lib/session';
import { palette } from '@/theme';

SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });

export default function RootLayout() {
  const [loaded] = useFonts({ Oxanium: require('../assets/fonts/Oxanium.ttf'), 'Goldman-Bold': require('../assets/fonts/Goldman-Bold.ttf') });
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return <QueryClientProvider client={queryClient}><SessionProvider><StatusBar style="light" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }} /></SessionProvider></QueryClientProvider>;
}
