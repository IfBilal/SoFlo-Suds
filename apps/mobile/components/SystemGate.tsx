import { type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import { useQuery } from '@tanstack/react-query';
import { Wrench, Download } from 'lucide-react-native';
import { endpoints } from '@/lib/api';
import { gateFor } from '@/lib/system';
import { BrandText, StateCard } from './BrandUI';
import { palette } from '@/theme';

const STORE_URL = Platform.select({ ios: 'https://apps.apple.com/app/soflo-suds', default: 'https://play.google.com/store/apps/details?id=com.soflosuds.app' });

/** Blocking system screens (maintenance, forced update) and a non-blocking offline banner. */
export function SystemGate({ children }: { children: ReactNode }) {
  const config = useQuery({ queryKey: ['shop-config'], queryFn: endpoints.config, staleTime: 5 * 60_000, retry: 1 });
  const network = Network.useNetworkState();
  const gate = gateFor(config.data, Constants.expoConfig?.version ?? '0.0.0');
  const offline = network.isConnected === false || network.isInternetReachable === false;

  if (gate !== 'ok') return (
    <View style={styles.full}>
      {gate === 'maintenance'
        ? <StateCard title="We’ll be right back" body={config.data?.maintenanceMessage ?? 'SoFlo Suds is being updated.'} action="Check again" onAction={() => config.refetch()} icon={<Wrench size={27} color={palette.cyan} />} />
        : <StateCard title="Update required" body="Please update SoFlo Suds to continue." action="Update" onAction={() => Linking.openURL(STORE_URL)} icon={<Download size={27} color={palette.cyan} />} />}
    </View>
  );
  return <>{offline && <View style={styles.banner} accessibilityRole="alert"><BrandText style={styles.bannerText}>You’re offline. Some things may not load.</BrandText></View>}{children}</>;
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: palette.bg, justifyContent: 'center', padding: 19 },
  banner: { backgroundColor: '#3a1220', paddingVertical: 8, paddingHorizontal: 16 },
  bannerText: { color: '#ffd0da', fontSize: 12, textAlign: 'center' },
});
