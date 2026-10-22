import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import { BrandText, Button, Card, Screen, StateCard } from '@/components/BrandUI';
import { endpoints } from '@/lib/api';
import { palette as c } from '@/theme';

export default function ProtectionScreen() {
  const query = useQuery({ queryKey: ['protection'], queryFn: endpoints.protection });
  return <Screen title="Your garage. Protected." subtitle="Protection records for every vehicle, in one place.">
    <Button label="My vehicles  →" variant="secondary" onPress={() => router.push('/vehicles')} style={{ marginBottom: 18 }} />
    {query.isPending ? <Card><BrandText muted>Loading protection records…</BrandText></Card> : query.isError ? <StateCard title="Records are unavailable" body="Please try again." action="Try again" onAction={() => query.refetch()} /> : query.data.length === 0 ? <StateCard title="No protection records yet" body="Ceramic coating, PPF and tint records will appear after completed services." action="Explore protection services" onAction={() => router.push('/services')} /> : query.data.map(record => <Card key={record.id} accent="cyan" style={{ marginBottom: 12 }}><ShieldCheck size={26} color={c.cyan} strokeWidth={1.6} /><BrandText style={{ fontSize: 18, fontWeight: '600', marginTop: 9 }}>{record.serviceName}</BrandText><BrandText muted>{record.vehicleName}</BrandText><BrandText style={{ marginTop: 12 }}>{record.product ?? 'Product details coming soon'}</BrandText>{record.coverage && <BrandText muted>{record.coverage}</BrandText>}<BrandText style={{ color: c.cyan, marginTop: 11 }}>{record.expiresOn ? `Covered until ${new Date(record.expiresOn).toLocaleDateString()}` : 'Warranty details coming soon'}</BrandText></Card>)}
  </Screen>;
}
