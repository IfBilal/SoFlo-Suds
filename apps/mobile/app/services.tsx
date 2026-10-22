import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BrandText, Button, Card, Screen, StateCard } from '@/components/BrandUI';
import { endpoints, type Service } from '@/lib/api';
import { palette as c } from '@/theme';
import { servicePhoto } from '@/lib/servicePhoto';

export default function ServicesScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<string | null>(serviceId ?? null);
  const query = useQuery({ queryKey: ['services'], queryFn: endpoints.services });
  const categories = useMemo(() => ['All', ...new Set(query.data?.map(x => x.category) ?? [])].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)), [query.data]);
  const service = query.data?.find(x => x.id === selected);
  return <Screen title="The right care. Every time." subtitle="From a fresh start to long-term protection.">
    {query.isPending ? <Card><BrandText muted>Loading services…</BrandText></Card> : query.isError ? <StateCard title="Services are unavailable" body="Please try again." action="Try again" onAction={() => query.refetch()} /> : <>
      <View style={styles.chips}>{categories.map(x => <Pressable key={x} onPress={() => { setCategory(x); setSelected(null); }} style={[styles.chip, category === x && styles.chipActive]}><BrandText style={{ fontSize: 12, color: category === x ? 'white' : c.muted }}>{x}</BrandText></Pressable>)}</View>
      {service ? <ServiceDetail service={service} onBack={() => setSelected(null)} /> : <View style={styles.grid}>{query.data.filter(x => category === 'All' || x.category === category).map((x, i) => <Pressable key={x.id} onPress={() => setSelected(x.id)} style={[styles.item, { borderColor: i % 2 ? c.magenta : c.cyan }]}><Image source={servicePhoto(x.name)} style={{width:"100%",height:114}} resizeMode="cover" /><View style={{padding:13}}><BrandText style={{ color: c.cyan, fontSize: 10, letterSpacing: 1 }}>{x.category.toUpperCase()}</BrandText><BrandText style={styles.itemName}>{x.name}</BrandText><BrandText muted style={{ fontSize: 11 }}>{x.description?.slice(0, 70) || 'Care tailored to your vehicle.'}</BrandText><BrandText style={{ color: i % 2 ? c.magentaLight : c.cyan, fontSize: 11, marginTop: 13 }}>Explore service  →</BrandText></View></Pressable>)}</View>}
    </>}
  </Screen>;
}
function ServiceDetail({ service, onBack }: { service: Service; onBack: () => void }) { return <><Pressable onPress={onBack}><BrandText style={{ color: c.cyan, marginBottom: 18 }}>← All services</BrandText></Pressable><Card accent="cyan"><Image source={servicePhoto(service.name)} style={{width:"100%",height:190,borderRadius:9,marginBottom:15}} resizeMode="cover" /><BrandText style={{ color: c.cyan, fontSize: 11, letterSpacing: 1.5 }}>{service.category.toUpperCase()}</BrandText><BrandText style={{ fontSize: 27, fontWeight: '600', marginTop: 8 }}>{service.name}</BrandText><BrandText muted style={{ marginTop: 13 }}>{service.description || 'Care tailored to your vehicle.'}</BrandText>{service.priceCents !== undefined && <BrandText style={{ color: c.cyan, fontSize: 21, marginTop: 18 }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(service.priceCents / 100)}</BrandText>}{service.durationMinutes !== undefined && <BrandText muted>{service.durationMinutes} minutes</BrandText>}<Button label="Book this service  →" onPress={() => router.push({ pathname: '/booking' as never, params: { serviceId: service.id } })} style={{ marginTop: 22 }} /></Card></>; }
const styles = StyleSheet.create({ chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 20 }, chip: { borderWidth: 1, borderColor: '#414141', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: c.panelAlt }, chipActive: { backgroundColor: c.magenta, borderColor: c.magenta }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 }, item: { width: '48%', minHeight: 210, backgroundColor: '#111', borderWidth: 1, borderRadius: 12, overflow: 'hidden' }, itemName: { fontSize: 16, fontWeight: '600', marginTop: 6 } });
