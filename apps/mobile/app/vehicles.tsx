import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CarFront } from 'lucide-react-native';
import { BrandText, Button, Card, Screen, StateCard } from '@/components/BrandUI';
import { api, endpoints, type Vehicle } from '@/lib/api';
import { palette as c } from '@/theme';

export default function VehiclesScreen() {
  const query = useQuery({ queryKey: ['vehicles'], queryFn: endpoints.vehicles });
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function remove(vehicle: Vehicle) {
    setDeletingId(vehicle.id); setError('');
    try {
      await api(`/vehicles/${encodeURIComponent(vehicle.id)}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['vehicles'] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this vehicle.');
    } finally { setDeletingId(null); }
  }
  function confirmRemove(vehicle: Vehicle) {
    const message = `Remove ${vehicle.name} from your garage?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) void remove(vehicle);
      return;
    }
    Alert.alert('Remove vehicle', message, [
      { text: 'Keep vehicle', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void remove(vehicle) },
    ]);
  }

  return <Screen title="Your garage. Protected." subtitle="Every vehicle. Every service. One place.">
    <Button label="+ Add vehicle" variant="secondary" onPress={() => router.push('/vehicle-form' as never)} style={{ marginBottom: 18 }} />
    {!!error && <Card accent="magenta" style={{ marginBottom: 12 }}><BrandText style={{ color: c.magentaLight }}>{error}</BrandText></Card>}
    {query.isPending ? <Card><BrandText muted>Loading vehicles…</BrandText></Card>
      : query.isError ? <StateCard title="Vehicles are unavailable" body="Please try again." action="Try again" onAction={() => query.refetch()} />
      : query.data.length === 0 ? <StateCard title="Your garage is ready" body="Add your first vehicle to book a service." action="Add vehicle" onAction={() => router.push('/vehicle-form' as never)} />
      : query.data.map(v => <Card key={v.id} accent="cyan" style={{ marginBottom: 12 }}>
        <CarFront size={32} color={c.cyan} strokeWidth={1.6} />
        <BrandText style={{ fontSize: 19, fontWeight: '600', marginTop: 12 }}>{v.name}</BrandText>
        {v.color && <BrandText muted>{v.color}</BrandText>}
        <Button label="Book for this vehicle  →" onPress={() => router.push({ pathname: '/services', params: { vehicleId: v.id } })} style={{ marginTop: 16 }} />
        <Button label="Edit vehicle" variant="secondary" onPress={() => router.push({ pathname: '/vehicle-form', params: { id: v.id } })} style={{ marginTop: 8 }} />
        <Button label={deletingId === v.id ? 'Removing…' : 'Remove vehicle'} variant="outline" disabled={!!deletingId} onPress={() => confirmRemove(v)} style={{ marginTop: 8 }} />
      </Card>)}
  </Screen>;
}
