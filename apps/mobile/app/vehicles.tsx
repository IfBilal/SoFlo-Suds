import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CarFront, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { BrandText, Button, Card, Screen, StateCard } from '@/components/BrandUI';
import { api, endpoints, type Vehicle } from '@/lib/api';
import { palette as c } from '@/theme';

export default function VehiclesScreen() {
  const query = useQuery({ queryKey: ['vehicles'], queryFn: endpoints.vehicles });
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const protection = useQuery({ queryKey: ['protection'], queryFn: endpoints.protection });
  const selected = query.data?.find(vehicle => vehicle.id === selectedId) ?? query.data?.[0];
  const selectedProtection = selected ? protection.data?.filter(record => record.vehicleId === selected.id) ?? [] : [];

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

  return <Screen>
    <View style={styles.headingRow}><View style={{ flex: 1 }}><BrandText style={styles.heading}>Your garage. Protected.</BrandText><BrandText muted style={styles.subtitle}>Every vehicle. Every service. One place.</BrandText></View><Pressable accessibilityRole="button" onPress={() => router.push('/vehicle-form' as never)} style={styles.addButton}><BrandText style={styles.addText}>＋  Add vehicle</BrandText></Pressable></View>
    {!!error && <Card accent="magenta" style={{ marginBottom: 12 }}><BrandText style={{ color: c.magentaLight }}>{error}</BrandText></Card>}
    {query.isPending ? <Card><BrandText muted>Loading vehicles…</BrandText></Card>
      : query.isError ? <StateCard title="Vehicles are unavailable" body="Please try again." action="Try again" onAction={() => query.refetch()} />
      : query.data.length === 0 ? <StateCard title="Your garage is ready" body="Add your first vehicle to book a service." action="Add vehicle" onAction={() => router.push('/vehicle-form' as never)} icon={<CarFront size={27} color={c.cyan} strokeWidth={1.6} />} />
      : selected && <>
        <View style={styles.chips}>{query.data.map(vehicle => <Pressable key={vehicle.id} accessibilityRole="button" onPress={() => setSelectedId(vehicle.id)} style={[styles.chip, selected.id === vehicle.id && styles.chipActive]}><BrandText style={{ color: selected.id === vehicle.id ? 'white' : c.muted, fontSize: 12 }}>{vehicle.name.replace(/^\d{4}\s/, '')}</BrandText></Pressable>)}</View>
        <View style={styles.vehicleVisual}><CarFront size={100} color={c.cyan} strokeWidth={1} /><BrandText muted style={styles.photoNote}>Vehicle photo not available</BrandText></View>
        <BrandText style={styles.vehicleName}>{selected.name}</BrandText>
        {!!selected.color && <BrandText muted>{selected.color}</BrandText>}
        <Button label="Book for this vehicle  →" onPress={() => router.push({ pathname: '/services', params: { vehicleId: selected.id } })} style={{ marginTop: 18 }} />
        <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/vehicle-form', params: { id: selected.id } })} style={styles.action}><BrandText style={styles.actionText}>Edit vehicle</BrandText></Pressable><Pressable accessibilityRole="button" disabled={!!deletingId} onPress={() => confirmRemove(selected)} style={styles.action}><BrandText style={styles.actionText}>{deletingId === selected.id ? 'Removing…' : 'Remove vehicle'}</BrandText></Pressable></View>
        <Card style={{ marginTop: 16 }}><BrandText style={styles.passportTitle}>Protection passport</BrandText>{protection.isPending ? <BrandText muted>Loading protection records…</BrandText> : selectedProtection.length ? selectedProtection.map(record => <Pressable key={record.id} accessibilityRole="button" onPress={() => router.push('/(tabs)/protection')} style={styles.protectionRow}><View style={styles.shield}><ShieldCheck size={22} color={c.cyan} strokeWidth={1.6} /></View><View style={{ flex: 1 }}><BrandText style={{ fontWeight: '600' }}>{record.serviceName}</BrandText><BrandText muted style={{ fontSize: 11 }}>{record.product ?? 'Warranty details coming soon'}</BrandText></View><ChevronRight size={18} color={c.muted} /></Pressable>) : <BrandText muted>No protection records for this vehicle yet.</BrandText>}<Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/protection')} style={styles.protectionRow}><View style={styles.shield}><ShieldCheck size={22} color={c.cyan} strokeWidth={1.6} /></View><View style={{ flex: 1 }}><BrandText>All protection records</BrandText></View><ChevronRight size={18} color={c.muted} /></Pressable></Card>
      </>}
  </Screen>;
}
const styles = StyleSheet.create({ headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 19 }, heading: { color: c.text, fontSize: 27, lineHeight: 32, fontWeight: '600', letterSpacing: -.8 }, subtitle: { fontSize: 12, lineHeight: 18, marginTop: 8 }, addButton: { backgroundColor: c.cyan, minHeight: 44, minWidth: 128, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, addText: { color: c.darkOnCyan, fontSize: 12, fontWeight: '600' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }, chip: { borderWidth: 1, borderColor: c.border, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9 }, chipActive: { backgroundColor: c.magenta, borderColor: c.magenta }, vehicleVisual: { height: 220, borderRadius: 10, backgroundColor: '#101821', borderWidth: 1, borderColor: '#233746', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, photoNote: { position: 'absolute', bottom: 12, fontSize: 11 }, vehicleName: { fontSize: 21, fontWeight: '600', marginTop: 19 }, actions: { flexDirection: 'row', gap: 10, marginTop: 12 }, action: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: c.cyan, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, actionText: { color: c.cyan, fontSize: 12 }, passportTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12 }, protectionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: c.border, paddingVertical: 13 }, shield: { width: 38, height: 38, borderWidth: 1, borderColor: c.cyan, borderRadius: 9, alignItems: 'center', justifyContent: 'center' } });
