import { Image, View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react-native';
import { BrandText, Card, Screen, SectionTitle, StateCard } from '@/components/BrandUI';
import { endpoints } from '@/lib/api';
import { palette as c } from '@/theme';

export default function GalleryScreen() {
  const gallery = useQuery({ queryKey: ['gallery'], queryFn: endpoints.gallery });
  const reviews = useQuery({ queryKey: ['reviews'], queryFn: endpoints.reviews });
  return <Screen title="Fresh from SoFlo." subtitle="Before and after, done with care.">
    {gallery.isPending ? <Card><BrandText muted>Loading gallery…</BrandText></Card> : gallery.isError ? <StateCard title="Gallery is unavailable" body="Please try again." action="Try again" onAction={() => gallery.refetch()} /> : gallery.data.length === 0 ? <StateCard title="Projects are coming soon" body="SoFlo Suds will share before-and-after work here." /> : gallery.data.map((x, i) => <Card key={x.id} accent={i % 2 ? 'magenta' : 'cyan'} style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}><View style={styles.photos}><View style={styles.photo}><Image source={{ uri: x.beforeUrl }} style={styles.image} /><BrandText style={styles.label}>BEFORE</BrandText></View><View style={styles.photo}><Image source={{ uri: x.afterUrl }} style={styles.image} /><BrandText style={styles.label}>AFTER</BrandText></View></View><View style={{ padding: 16 }}><BrandText style={{ color: c.cyan, fontSize: 10, letterSpacing: 1 }}>{x.tag?.toUpperCase()}</BrandText><BrandText style={{ fontSize: 19, fontWeight: '600' }}>{x.title}</BrandText>{x.caption && <BrandText muted>{x.caption}</BrandText>}</View></Card>)}
    <SectionTitle>What customers say.</SectionTitle>
    {reviews.isPending ? <Card><BrandText muted>Loading reviews…</BrandText></Card> : reviews.isError ? <StateCard title="Reviews are unavailable" body="Please try again." action="Try again" onAction={() => reviews.refetch()} /> : reviews.data.length === 0 ? <StateCard title="No reviews yet" body="Customer reviews will appear here after completed services." /> : reviews.data.map(x => <Card key={x.id} style={{ marginBottom: 12 }}><View style={{ flexDirection: 'row', gap: 2 }}>{[1,2,3,4,5].map(n => <Star key={n} size={15} color={c.magenta} fill={n <= x.rating ? c.magenta : 'transparent'} />)}</View><BrandText style={{ fontWeight: '600', marginTop: 9 }}>{x.customerName}</BrandText>{x.body && <BrandText muted>{x.body}</BrandText>}</Card>)}
  </Screen>;
}
const styles = StyleSheet.create({ photos: { height: 190, flexDirection: 'row' }, photo: { flex: 1, backgroundColor: c.panelAlt }, image: { width: '100%', height: '100%' }, label: { color: 'white', fontSize: 10, position: 'absolute', bottom: 8, left: 8, backgroundColor: '#000A', padding: 4 } });
