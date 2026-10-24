import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandText, Button, Card, Screen, StateCard } from '@/components/BrandUI';
import { ApiError, endpoints } from '@/lib/api';
import { palette as c } from '@/theme';

/** "Add to next booking": pick an upcoming unpaid booking, or keep the product for the next one. */
export default function ShopAdd() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const queryClient = useQueryClient();
  const bookings = useQuery({ queryKey: ['bookings'], queryFn: endpoints.bookings });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const open = bookings.data?.filter((b) => !['completed', 'canceled', 'cancelled'].includes(b.status.toLowerCase()) && ['unpaid', 'pending', undefined].includes(b.paymentStatus?.toLowerCase())) ?? [];

  async function run(work: () => Promise<string>) {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { setMessage({ ok: true, text: await work() }); await queryClient.invalidateQueries({ queryKey: ['bookings'] }); } catch (e) { setMessage({ ok: false, text: e instanceof ApiError || e instanceof Error ? e.message : 'Please try again.' }); } finally { setBusy(false); }
  }

  if (!productId) return <Screen title="Add to a booking."><StateCard title="Pick a product first" body="Choose a care product in the shop." action="Open shop" onAction={() => router.replace('/shop')} /></Screen>;
  return <Screen title="Add to a booking." subtitle="The shop includes your care product with the visit.">
    {bookings.isPending ? <Card><BrandText muted>Loading your bookings…</BrandText></Card> : bookings.isError ? <StateCard title="Bookings unavailable" body="Please try again." action="Try again" onAction={() => bookings.refetch()} /> : <>
      {open.map((b) => <Card key={b.id} style={{ marginBottom: 12 }}>
        <BrandText style={{ fontWeight: '600' }}>{b.serviceName}</BrandText>
        <BrandText muted>{b.vehicleName} · {b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString() : 'Date to be confirmed'}</BrandText>
        <Button label="Add to this booking" variant="secondary" disabled={busy} onPress={() => run(async () => { const x = await endpoints.addProductToBooking(b.id, productId); return `${x.name} added to ${b.serviceName}.`; })} style={{ marginTop: 12 }} />
      </Card>)}
      <Card accent="cyan">
        <BrandText style={{ fontWeight: '600' }}>Next booking</BrandText>
        <BrandText muted>{open.length ? 'Or keep it for the next service you book.' : 'You have no open booking. We will add it to the next one you book.'}</BrandText>
        <Button label="Add to my next booking" variant="outline" disabled={busy} onPress={() => run(async () => { await endpoints.addToNextBooking(productId); return 'Saved. It is added when you next book.'; })} style={{ marginTop: 12 }} />
      </Card>
      {message && <BrandText style={{ marginTop: 14, color: message.ok ? c.cyan : '#ff8aa0' }}>{message.text}</BrandText>}
      <Button label="Back to the shop" variant="secondary" onPress={() => router.replace('/shop')} style={{ marginTop: 16 }} />
    </>}
  </Screen>;
}
