import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BrandText, Button, Card, Screen, StateCard } from '@/components/BrandUI';
import { endpoints } from '@/lib/api';
import { palette as c } from '@/theme';

export default function BookingsScreen() {
  const [tab, setTab] = useState<'Upcoming' | 'Past'>('Upcoming');
  const query = useQuery({ queryKey: ['bookings'], queryFn: endpoints.bookings });
  const rows = query.data?.filter(b => (tab === 'Past') === ['completed', 'cancelled', 'canceled'].includes(b.status.toLowerCase())) ?? [];
  return <Screen title="Your next clean, organized." subtitle="Appointments and service history from SoFlo Suds.">
    <View style={styles.tabs}>{(['Upcoming', 'Past'] as const).map(t => <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.active]}><BrandText style={{ color: tab === t ? c.text : c.muted }}>{t}</BrandText></Pressable>)}</View>
    {query.isPending ? <Card><BrandText muted>Loading bookings…</BrandText></Card> : query.isError ? <StateCard title="Bookings are unavailable" body="Please try again." action="Try again" onAction={() => query.refetch()} /> : rows.length === 0 ? <StateCard title={tab === 'Upcoming' ? 'Your next visit starts here.' : 'No past visits yet.'} body={tab === 'Upcoming' ? 'Explore services and book your vehicle’s next care.' : 'Completed services will appear here.'} action={tab === 'Upcoming' ? 'Explore services' : undefined} onAction={() => router.push('/services')} /> : rows.map(b => <Card key={b.id} accent="cyan" style={{ marginBottom: 12 }}><View style={styles.top}><BrandText style={styles.status}>{b.status}</BrandText><BrandText style={styles.name}>{b.serviceName}</BrandText><BrandText muted>{b.vehicleName}</BrandText></View><BrandText style={{ marginTop: 16 }}>{new Date(b.scheduledAt).toLocaleString()}</BrandText>{b.location && <BrandText muted>{b.location}</BrandText>}<View style={styles.timeline}>{['Requested', 'Confirmed', 'In progress', 'Complete'].map((s, i) => <View key={s} style={styles.stage}><View style={[styles.dot, i === 0 && { backgroundColor: c.cyan }]} /><BrandText muted style={{ fontSize: 9 }}>{s}</BrandText></View>)}</View><Button label="View booking" variant="outline" onPress={() => router.push({ pathname: '/booking-detail' as never, params: { id: b.id } })} /></Card>)}
  </Screen>;
}
const styles = StyleSheet.create({ tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: c.border, marginBottom: 20 }, tab: { flex: 1, paddingVertical: 12, alignItems: 'center' }, active: { borderBottomWidth: 2, borderColor: c.magenta }, top: { gap: 5 }, status: { alignSelf: 'flex-start', color: c.cyan, borderColor: c.cyan, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, fontSize: 11 }, name: { fontSize: 19, fontWeight: '600' }, timeline: { flexDirection: 'row', marginVertical: 18 }, stage: { flex: 1, alignItems: 'center', gap: 5 }, dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: c.cyan } });
