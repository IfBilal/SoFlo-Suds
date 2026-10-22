import { useEffect, useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandText, Button, Card, Screen } from '@/components/BrandUI';
import { api, endpoints } from '@/lib/api';
import { font, palette as c } from '@/theme';

export default function VehicleForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const qc = useQueryClient();
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: endpoints.vehicles, enabled: !!id });
  const [make, setMake] = useState(''), [model, setModel] = useState(''), [year, setYear] = useState(''), [color, setColor] = useState(''), [plate, setPlate] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    const vehicle = vehicles.data?.find(x => x.id === id);
    if (!vehicle) return;
    setMake(vehicle.make ?? ''); setModel(vehicle.model ?? ''); setYear(vehicle.year ? String(vehicle.year) : ''); setColor(vehicle.color ?? ''); setPlate(vehicle.plate ?? '');
  }, [id, vehicles.data]);
  async function submit() {
    setBusy(true); setError('');
    try {
      await api(id ? `/vehicles/${encodeURIComponent(id)}` : '/vehicles', { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ make: make.trim(), model: model.trim(), year: Number(year), color: color.trim(), plate: plate.trim() || undefined }) });
      await qc.invalidateQueries({ queryKey: ['vehicles'] }); router.back();
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  return <Screen title={id ? 'Edit vehicle.' : 'Add a vehicle.'} subtitle="Keep every service connected to the right ride."><Card>{id && vehicles.isPending ? <BrandText muted>Loading vehicle…</BrandText> : id && !vehicles.data?.some(x => x.id === id) ? <BrandText muted>Vehicle unavailable. Please go back and try again.</BrandText> : <>{[['Make', make, setMake], ['Model', model, setModel], ['Year', year, setYear], ['Color', color, setColor], ['Plate (optional)', plate, setPlate]].map(([label, value, setter]) => <Field key={String(label)} label={String(label)} value={value as string} setter={setter as (s: string) => void} />)}{error && <BrandText style={{ color: c.magentaLight, marginBottom: 12 }}>{error}</BrandText>}<Button label={busy ? 'Saving…' : 'Save vehicle'} onPress={submit} disabled={busy || !make || !model || !year || !color} /></>}</Card></Screen>;
}
function Field({ label, value, setter }: { label: string; value: string; setter: (s: string) => void }) { return <><BrandText>{label}</BrandText><TextInput value={value} onChangeText={setter} keyboardType={label === 'Year' ? 'number-pad' : 'default'} style={styles.input} placeholderTextColor={c.muted} /></>; }
const styles = StyleSheet.create({ input: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, color: c.text, fontFamily: font.body, borderRadius: 8, height: 47, paddingHorizontal: 14, marginTop: 6, marginBottom: 16 } });
