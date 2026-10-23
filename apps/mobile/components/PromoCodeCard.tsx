import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BrandText, Button, Card } from './BrandUI';
import { ApiError, api } from '@/lib/api';
import { font, palette as c } from '@/theme';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Promo entry for an unpaid booking. The server validates and applies the discount in Urable. */
export function PromoCodeCard({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply() {
    if (!code.trim() || busy) return;
    setBusy(true); setMessage(null);
    try {
      const r = await api<{ discountCents: number; totalCents: number }>(`/bookings/${encodeURIComponent(bookingId)}/promo`, { method: 'POST', body: JSON.stringify({ code: code.trim() }) });
      setMessage({ ok: true, text: `Code applied: ${usd(r.discountCents)} off. New total ${usd(r.totalCents)}.` });
      setCode('');
      await queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError || e instanceof Error ? e.message : 'Could not apply that code.' });
    } finally { setBusy(false); }
  }

  return (
    <Card style={{ marginTop: 14 }}>
      <BrandText style={{ fontSize: 16, fontWeight: '600' }}>Promo code</BrandText>
      <TextInput accessibilityLabel="Promo code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={40}
        placeholder="Enter code" placeholderTextColor={c.muted} style={styles.input} onSubmitEditing={apply} />
      <Button label={busy ? 'Applying…' : 'Apply code'} variant="secondary" onPress={apply} disabled={busy || !code.trim()} />
      {message && <BrandText style={{ marginTop: 10, color: message.ok ? c.cyan : '#ff8aa0' }}>{message.text}</BrandText>}
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, color: c.text, fontFamily: font.body, borderRadius: 8, paddingHorizontal: 14, height: 47, marginTop: 10, marginBottom: 12 },
});
