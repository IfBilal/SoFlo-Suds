import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandText, Button, Card, Screen, StateCard } from '@/components/BrandUI';
import { UrableBookingWebView } from '@/components/UrableBookingWebView';
import { endpoints } from '@/lib/api';
import { palette as c } from '@/theme';

export default function BookingScreen() {
  const queryClient = useQueryClient();
  const { serviceId, vehicleId: requestedVehicleId } = useLocalSearchParams<{ serviceId?: string; vehicleId?: string }>();
  const [location, setLocation] = useState<'shop' | 'field'>('shop');
  const [stage, setStage] = useState<'choose' | 'checkout' | 'verify'>('choose');
  const [vehicleId, setVehicleId] = useState<string | null>(requestedVehicleId ?? null);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const services = useQuery({ queryKey: ['services'], queryFn: endpoints.services });
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: endpoints.vehicles });
  const recent = useQuery({ queryKey: ['booking-handoff-latest'], queryFn: endpoints.latestBookingHandoff });
  const handoff = useQuery({
    queryKey: ['booking-handoff', attemptId, confirmationNumber],
    queryFn: () => endpoints.checkBookingHandoff(attemptId!, confirmationNumber ? Number(confirmationNumber) : undefined),
    enabled: stage === 'verify' && !!attemptId && (!confirmationNumber || /^[1-9]\d*$/.test(confirmationNumber)),
    refetchInterval: (query) => query.state.data?.state === 'pending' ? 5000 : false,
  });
  useEffect(() => {
    if (handoff.data?.state === 'matched' || handoff.data?.state === 'expired') queryClient.setQueryData(['booking-handoff-latest'], null);
  }, [handoff.data?.state, queryClient]);
  async function beginCheckout() {
    if (starting) return;
    setStarting(true);
    try {
      const attempt = await endpoints.startBookingHandoff();
      queryClient.setQueryData(['booking-handoff-latest'], attempt);
      setAttemptId(attempt.attemptId);
      setConfirmationNumber('');
      setStage('checkout');
    } catch {
      Alert.alert('Booking unavailable', 'Could not start a secure booking. Please try again.');
    } finally { setStarting(false); }
  }
  const selected = services.data?.find(x => x.id === serviceId);
  const selectedVehicle = vehicles.data?.find(x => x.id === vehicleId) ?? vehicles.data?.[0];
  if (stage === 'checkout') return <View style={styles.page}><View style={styles.checkoutHeader}><Pressable onPress={() => setStage('verify')}><BrandText style={{ color: c.cyan }}>Close</BrandText></Pressable><BrandText style={{ fontWeight: '600' }}>SoFlo Suds booking</BrandText></View><UrableBookingWebView options={{ location, serviceId }} /></View>;
  if (stage === 'verify') return <Screen title="Check your booking." subtitle="We’ll show your appointment when Urable confirms it.">
    <Card>
      {handoff.data?.state === 'matched' && handoff.data.booking ? <>
        <BrandText style={styles.heading}>Booking found</BrandText>
        <BrandText>{handoff.data.booking.serviceName}</BrandText>
        <BrandText muted>Payment: {handoff.data.booking.paymentStatus ?? 'Checking with SoFlo Suds'}</BrandText>
        <Button label="View booking" onPress={() => router.replace({ pathname: '/booking-detail' as never, params: { id: handoff.data!.booking!.id } })} style={{ marginTop: 18 }} />
      </> : <>
        <BrandText muted>{handoff.data?.state === 'expired' ? 'This booking check expired. If you completed checkout, contact the shop with your Urable booking number.' : handoff.data?.state === 'ambiguous' ? 'We found more than one new appointment. Enter the booking number from Urable’s confirmation to identify yours.' : 'If you completed checkout, we’re checking Urable for your appointment. Do not submit another booking while this check is pending.'}</BrandText>
        {(handoff.data?.state === 'ambiguous' || !!confirmationNumber) && <TextInput accessibilityLabel="Urable booking number" keyboardType="number-pad" placeholder="Booking number" placeholderTextColor={c.muted} value={confirmationNumber} onChangeText={setConfirmationNumber} style={styles.confirmationInput} />}
        {handoff.isError && <BrandText muted style={{ marginTop: 12 }}>Could not check Urable right now. Try again shortly.</BrandText>}
        {handoff.isFetching && <ActivityIndicator color={c.cyan} style={{ marginTop: 16 }} />}
        <Button label="Check again" onPress={() => void handoff.refetch()} style={{ marginTop: 18 }} />
        <Button label="My bookings" variant="outline" onPress={() => router.replace('/(tabs)/bookings')} style={{ marginTop: 10 }} />
        <Button label="Return to secure booking" variant="outline" onPress={() => setStage('checkout')} style={{ marginTop: 10 }} />
      </>}
    </Card>
  </Screen>;
  return <Screen title="Your next clean starts here." subtitle="Choose your vehicle and service.">
    <View style={styles.steps}>{['1. Vehicle & service', '2. Location', '3. Schedule & pay'].map((s, i) => <View key={s} style={styles.step}><View style={[styles.stepLine, i === 0 && styles.stepActive]} /><BrandText style={styles.stepLabel}>{s}</BrandText></View>)}</View>
    {services.isPending || vehicles.isPending ? <Card><BrandText muted>Loading booking choices…</BrandText></Card>
      : services.isError || vehicles.isError ? <StateCard title="Booking is unavailable" body="Please try again." action="Try again" onAction={() => { services.refetch(); vehicles.refetch(); }} />
      : <Card>
        {recent.data && <Card accent="cyan" style={{ marginBottom: 20 }}>
          <BrandText style={{ fontWeight: '600' }}>Already booked?</BrandText>
          <BrandText muted style={{ marginTop: 6 }}>Check a recent Urable checkout before starting another booking.</BrandText>
          <Button label="Check recent booking" onPress={() => { const id = recent.data?.attemptId; if (id) { setAttemptId(id); setStage('verify'); } }} style={{ marginTop: 14 }} />
        </Card>}
        <BrandText style={styles.heading}>Your vehicle & service</BrandText>
        <BrandText style={styles.fieldLabel}>Choose your vehicle</BrandText>
        {selectedVehicle ? <Pressable accessibilityRole="button" accessibilityLabel="Choose vehicle" onPress={() => setVehiclesOpen(!vehiclesOpen)} style={styles.selection}><BrandText style={styles.selectionText}>{selectedVehicle.name}</BrandText><BrandText style={{ color: c.cyan }}>⌄</BrandText></Pressable> : <BrandText muted style={styles.emptyVehicle}>Add a vehicle to keep this booking connected to your garage.</BrandText>}
        {vehiclesOpen && vehicles.data?.map(vehicle => <Pressable key={vehicle.id} accessibilityRole="button" onPress={() => { setVehicleId(vehicle.id); setVehiclesOpen(false); }} style={styles.vehicleOption}><BrandText>{vehicle.name}</BrandText></Pressable>)}
        <Pressable onPress={() => router.push('/vehicle-form' as never)} style={styles.textLink}><BrandText style={{ color: c.cyan, fontSize: 12 }}>+ Add a vehicle</BrandText></Pressable>
        <BrandText style={styles.fieldLabel}>Service</BrandText>
        <Pressable accessibilityRole="button" onPress={() => router.push('/services')} style={styles.selection}><BrandText style={styles.selectionText}>{selected?.name ?? 'Choose a service'}</BrandText><BrandText style={{ color: c.cyan }}>›</BrandText></Pressable>
        <BrandText style={[styles.heading, { marginTop: 24 }]}>Where should we come?</BrandText>
        <View style={styles.modes}><Pressable onPress={() => setLocation('shop')} style={[styles.mode, location === 'shop' && styles.modeActive]}><BrandText style={{ fontWeight: '600' }}>In-shop</BrandText><BrandText muted style={{ fontSize: 11 }}>Bring your vehicle to SoFlo Suds.</BrandText></Pressable><Pressable onPress={() => setLocation('field')} style={[styles.mode, location === 'field' && styles.modeActive]}><BrandText style={{ fontWeight: '600' }}>Mobile</BrandText><BrandText muted style={{ fontSize: 11 }}>We come to your location.</BrandText></Pressable></View>
        <BrandText muted style={styles.handoffNote}>You’ll confirm your vehicle, enter a mobile address if needed, choose a time and review the payment in the secure booking step.</BrandText>
        <Button label={starting ? 'Opening booking…' : 'Choose a time  →'} onPress={() => void beginCheckout()} disabled={!selected || !selectedVehicle || starting} />
      </Card>}
  </Screen>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: c.bg }, checkoutHeader: { minHeight: 62, paddingHorizontal: 18, borderBottomWidth: 2, borderColor: c.cyan, flexDirection: 'row', alignItems: 'center', gap: 20 }, steps: { flexDirection: 'row', gap: 6, marginBottom: 23 }, step: { flex: 1 }, stepLine: { height: 3, backgroundColor: c.border, marginBottom: 7 }, stepActive: { backgroundColor: c.cyan }, stepLabel: { fontSize: 10, lineHeight: 14 }, heading: { fontSize: 21, lineHeight: 27, fontWeight: '600', marginBottom: 22 }, fieldLabel: { fontSize: 12, marginBottom: 8 }, selection: { minHeight: 49, paddingHorizontal: 15, borderWidth: 1, borderColor: '#454545', borderRadius: 8, backgroundColor: c.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 }, selectionText: { flex: 1, fontSize: 16, fontWeight: '600' }, emptyVehicle: { fontSize: 12, marginBottom: 12 }, vehicleOption: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.panelAlt }, textLink: { marginBottom: 18 }, modes: { flexDirection: 'row', gap: 9 }, mode: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 9, padding: 12, minHeight: 85 }, modeActive: { borderColor: c.magenta }, handoffNote: { fontSize: 11, lineHeight: 18, marginVertical: 18 }, confirmationInput: { minHeight: 48, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, marginTop: 16 } });
