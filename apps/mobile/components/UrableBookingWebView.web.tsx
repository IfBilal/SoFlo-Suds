import { useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { BrandText, Button, Card } from '@/components/BrandUI';
import { palette as c } from '@/theme';
import { buildUrableBookingUrl, DEFAULT_URABLE_SHOP_URL, type UrableBookingLinkOptions } from '@/lib/urableBooking';

export function UrableBookingWebView({ options }: { options: UrableBookingLinkOptions }) {
  const baseUrl = process.env.EXPO_PUBLIC_URABLE_SHOP_URL ?? DEFAULT_URABLE_SHOP_URL;
  const url = useMemo(() => buildUrableBookingUrl(baseUrl, options), [baseUrl, options.location, options.categoryId, options.serviceId, options.priceSku]);
  return <View style={styles.container}><Card accent="cyan"><BrandText style={styles.eyebrow}>SECURE BOOKING</BrandText><BrandText style={styles.title}>Choose your time with SoFlo Suds.</BrandText><BrandText muted style={styles.copy}>Urable handles available appointments and payment in a separate browser tab. Return here after you finish to check your booking status.</BrandText><Button label="Open secure booking  →" onPress={() => void Linking.openURL(url)} style={{ marginTop: 22 }} /></Card></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 19, backgroundColor: c.bg }, eyebrow: { color: c.cyan, fontSize: 11, letterSpacing: 2, fontWeight: '600' }, title: { fontSize: 23, lineHeight: 29, fontWeight: '600', marginTop: 14 }, copy: { marginTop: 12 } });
