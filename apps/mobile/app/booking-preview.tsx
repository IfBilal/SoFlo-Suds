import { Redirect, Stack, useRouter } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { UrableBookingWebView } from '@/components/UrableBookingWebView';

export default function BookingPreview() {
  const router = useRouter();
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close booking preview">
          <Text style={styles.close}>Close</Text>
        </Pressable>
        <Text style={styles.title}>Urable booking preview</Text>
      </View>
      <Text style={styles.notice}>Development preview. Do not complete a real booking or payment.</Text>
      <UrableBookingWebView options={{ location: 'shop' }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#08090C' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 16 },
  close: { color: '#FFFFFF', fontSize: 16 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  notice: { color: '#B9BBC3', paddingHorizontal: 16, paddingBottom: 8, fontSize: 12 },
});
