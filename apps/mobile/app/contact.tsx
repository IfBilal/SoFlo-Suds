import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Phone, Mail } from 'lucide-react-native';
import { BrandText, Card, RowLink, Screen, StateCard } from '@/components/BrandUI';
import { api } from '@/lib/api';
import { palette as c } from '@/theme';
interface Config { shopPhone: string | null; shopEmail: string | null; shopAddress: string | null; mobileAreaText: string | null }
export default function Contact() { const query = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config') }); return <Screen title="Contact SoFlo Suds." subtitle="We’re here to help with your vehicle.">{query.isPending ? <Card><BrandText muted>Loading contact details…</BrandText></Card> : query.isError ? <StateCard title="Contact details unavailable" body="Please try again." action="Try again" onAction={() => query.refetch()} /> : <Card>{query.data.shopPhone && <RowLink icon={<Phone size={20} color={c.cyan} />} title="Call the shop" subtitle={query.data.shopPhone} onPress={() => Linking.openURL(`tel:${query.data.shopPhone}`)} />}{query.data.shopEmail && <RowLink icon={<Mail size={20} color={c.cyan} />} title="Email the shop" subtitle={query.data.shopEmail} onPress={() => Linking.openURL(`mailto:${query.data.shopEmail}`)} />}{query.data.shopAddress && <BrandText muted style={{ marginTop: 14 }}>In-shop: {query.data.shopAddress}</BrandText>}{!query.data.shopPhone && !query.data.shopEmail && <BrandText muted>Contact details will appear here when configured.</BrandText>}</Card>}</Screen>; }
