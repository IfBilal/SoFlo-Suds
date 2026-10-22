import { useState } from 'react';
import { TextInput } from 'react-native';
import { router } from 'expo-router';
import { BrandText, Button, Card, Screen } from '@/components/BrandUI';
import { endpoints } from '@/lib/api';
import { font, palette as c } from '@/theme';

export default function Forgot() { const [email, setEmail] = useState(''), [sent, setSent] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false); async function submit() { setBusy(true); setError(''); try { await endpoints.forgot(email.trim()); setSent(true); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } } return <Screen title="Reset your password." subtitle="We’ll send instructions to your email."><Card>{sent ? <><BrandText>Check your email for a reset link.</BrandText><Button label="Back to login" onPress={() => router.replace('/login')} style={{ marginTop: 18 }} /></> : <><BrandText>Email</BrandText><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, height: 47, paddingHorizontal: 14, fontFamily: font.body, marginVertical: 12 }} />{!!error && <BrandText style={{ color: c.magentaLight }}>{error}</BrandText>}<Button label={busy ? 'Sending…' : 'Send reset link'} onPress={submit} disabled={busy || !email} /></>}</Card></Screen>; }
