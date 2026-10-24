import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { BellRing } from 'lucide-react-native';
import { BrandText, Button, Card } from '@/components/BrandUI';
import { enablePushNotifications, pushPermissionState } from '@/lib/push';
import { palette as c } from '@/theme';

/**
 * Handbook 5.2: explain what notifications are for before the OS prompt. Shown once per account on Home while the phone has
 * not been asked yet. If the permission is already granted we only re-register this device's token (silent, after a reinstall).
 */
export function PushPrompt({ userId }: { userId?: string }) {
  const [visible, setVisible] = useState(false);
  const key = `soflo_push_prompt_${userId}`;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const state = await pushPermissionState();
        if (state === 'granted') { await enablePushNotifications(); return; }
        if (state !== 'undetermined') return;
        if (await SecureStore.getItemAsync(key)) return;
        if (alive) setVisible(true);
      } catch { /* the prompt is a convenience; Profile > Notifications still works */ }
    })();
    return () => { alive = false; };
  }, [userId, key]);
  async function close(ask: boolean) {
    setVisible(false);
    try { await SecureStore.setItemAsync(key, '1'); if (ask) await enablePushNotifications(); } catch { /* ignored */ }
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close(false)}>
    <View style={styles.backdrop}><Card accent="cyan" style={styles.card}>
      <BellRing size={30} color={c.cyan} />
      <BrandText style={styles.title}>Stay in the loop.</BrandText>
      <BrandText muted style={styles.body}>We’ll tell you when your booking is confirmed, remind you the day before, and let you know when your vehicle’s status changes. You can change this any time in Profile.</BrandText>
      <Button label="Turn on notifications" onPress={() => close(true)} />
      <Button label="Not now" variant="secondary" onPress={() => close(false)} style={{ marginTop: 10 }} />
    </Card></View>
  </Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: '#000000CC', justifyContent: 'center', padding: 22 }, card: { gap: 12 }, title: { fontSize: 22, fontWeight: '600' }, body: { fontSize: 14, lineHeight: 21, marginBottom: 6 } });
