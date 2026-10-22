import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { buildUrableBookingUrl, DEFAULT_URABLE_SHOP_URL, UrableBookingLinkOptions } from '@/lib/urableBooking';

interface Props {
  options: UrableBookingLinkOptions;
}

export function UrableBookingWebView({ options }: Props) {
  const baseUrl = process.env.EXPO_PUBLIC_URABLE_SHOP_URL ?? DEFAULT_URABLE_SHOP_URL;
  const url = useMemo(
    () => buildUrableBookingUrl(baseUrl, options),
    [baseUrl, options.location, options.categoryId, options.serviceId, options.priceSku],
  );

  return (
    <WebView
      source={{ uri: url }}
      style={styles.webView}
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  webView: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08090C' },
});
