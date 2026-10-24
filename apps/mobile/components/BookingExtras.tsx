import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BrandText, Button, Card } from './BrandUI';
import { ApiError, endpoints, type Booking } from '@/lib/api';
import { palette as c } from '@/theme';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const errText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

/** Rewards and shop products on one booking. Editable only while the booking is unpaid and upcoming. */
export function BookingExtras({ booking, editable }: { booking: Booking; editable: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const rewards = useQuery({ queryKey: ['rewards'], queryFn: endpoints.rewards, enabled: editable && !booking.reward });
  const products = useQuery({ queryKey: ['shop'], queryFn: endpoints.shopProducts, enabled: editable });
  const available = rewards.data?.redemptions.filter((r) => r.status === 'available' && !r.appliedJobId) ?? [];
  const added = new Set(booking.products?.map((p) => p.productId));
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['booking', booking.id] }), queryClient.invalidateQueries({ queryKey: ['rewards'] })]);

  async function run(key: string, work: () => Promise<string>) {
    if (busy) return;
    setBusy(key); setMessage(null);
    try { setMessage({ ok: true, text: await work() }); await refresh(); } catch (e) { setMessage({ ok: false, text: errText(e, 'Please try again.') }); } finally { setBusy(null); }
  }

  const hasAnything = !!booking.reward || !!booking.products?.length;
  if (!editable && !hasAnything) return null;
  return <Card style={{ marginTop: 14 }}>
    <BrandText style={{ fontSize: 16, fontWeight: '600' }}>Rewards and care products</BrandText>
    {booking.reward && <View style={{ marginTop: 10 }}>
      <BrandText style={{ color: c.cyan }}>Reward on this booking</BrandText>
      <BrandText>{booking.reward.name}</BrandText>
      <BrandText muted style={{ fontSize: 12 }}>Code {booking.reward.code}. The shop will honour it at your visit.</BrandText>
    </View>}
    {!booking.reward && editable && (available.length > 0
      ? available.map((r) => <Button key={r.id} label={busy === r.id ? 'Adding…' : `Use “${r.name}” on this booking`} variant="secondary" disabled={!!busy}
          onPress={() => run(r.id, async () => { const x = await endpoints.attachReward(booking.id, r.id); return `${x.name} added to this booking.`; })} style={{ marginTop: 10 }} />)
      : <BrandText muted style={{ marginTop: 8 }}>Redeem points on the Rewards tab to add a reward here.</BrandText>)}
    {!!booking.products?.length && <View style={{ marginTop: 14 }}>
      <BrandText style={{ color: c.cyan }}>Care products on this booking</BrandText>
      {booking.products.map((p) => <BrandText key={p.productId}>{p.quantity} × {p.name}{p.priceCents ? ` · ${usd(p.priceCents * p.quantity)}` : ''}</BrandText>)}
    </View>}
    {editable && !!products.data?.length && <View style={{ marginTop: 14 }}>
      <BrandText style={{ color: c.cyan }}>Add a care product</BrandText>
      {products.data.filter((p) => !added.has(p.id)).slice(0, 8).map((p) => <Button key={p.id} label={busy === p.id ? 'Adding…' : `${p.name}${p.priceCents !== undefined ? ` · ${usd(p.priceCents)}` : ''}`} variant="outline" disabled={!!busy}
        onPress={() => run(p.id, async () => { const x = await endpoints.addProductToBooking(booking.id, p.id); return `${x.name} added. The shop will include it with your visit.`; })} style={{ marginTop: 8 }} />)}
      <Button label="Browse the shop" variant="secondary" onPress={() => router.push('/shop')} style={{ marginTop: 8 }} />
    </View>}
    {message && <BrandText style={{ marginTop: 10, color: message.ok ? c.cyan : '#ff8aa0' }}>{message.text}</BrandText>}
  </Card>;
}
