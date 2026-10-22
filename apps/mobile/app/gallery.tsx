import { useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react-native';
import { BrandText, Card, Screen, SectionTitle, StateCard } from '@/components/BrandUI';
import { endpoints } from '@/lib/api';
import { palette as c } from '@/theme';

function BeforeAfter({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [width, setWidth] = useState(0);
  const [split, setSplit] = useState(0.5);
  const move = (x: number) => {
    if (width) setSplit(Math.min(0.9, Math.max(0.1, x / width)));
  };
  const divider = width * split;
  return <View
    style={styles.photos}
    onLayout={event => setWidth(event.nativeEvent.layout.width)}
    onStartShouldSetResponder={() => true}
    onMoveShouldSetResponder={() => true}
    onResponderGrant={event => move(event.nativeEvent.locationX)}
    onResponderMove={event => move(event.nativeEvent.locationX)}
    accessible
    accessibilityRole="adjustable"
    accessibilityLabel="Compare before and after photos"
    accessibilityValue={{ min: 10, max: 90, now: Math.round(split * 100) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => setSplit(value => Math.min(0.9, Math.max(0.1, value + (event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
  >
    <Image source={{ uri: beforeUrl }} style={styles.fullImage} resizeMode="cover" />
    {width > 0 && <View style={[styles.afterClip, { left: divider, width: width - divider }]}><Image source={{ uri: afterUrl }} style={[styles.fullImage, { width, left: -divider }]} resizeMode="cover" /></View>}
    <View testID="before-after-divider" style={[styles.divider, { left: divider - 1 }]} pointerEvents="none"><View style={styles.handle}><BrandText style={styles.handleText}>‹ ›</BrandText></View></View>
    <BrandText style={[styles.label, { left: 8 }]}>BEFORE</BrandText>
    <BrandText style={[styles.label, { right: 8 }]}>AFTER</BrandText>
  </View>;
}

export default function GalleryScreen() {
  const gallery = useQuery({ queryKey: ['gallery'], queryFn: endpoints.gallery });
  const reviews = useQuery({ queryKey: ['reviews'], queryFn: endpoints.reviews });
  return <Screen title="Fresh from SoFlo." subtitle="Before and after, done with care.">
    {gallery.isPending ? <Card><BrandText muted>Loading gallery…</BrandText></Card> : gallery.isError ? <StateCard title="Gallery is unavailable" body="Please try again." action="Try again" onAction={() => gallery.refetch()} /> : gallery.data.length === 0 ? <StateCard title="Projects are coming soon" body="SoFlo Suds will share before-and-after work here." /> : gallery.data.map((x, i) => <Card key={x.id} accent={i % 2 ? 'magenta' : 'cyan'} style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}><BeforeAfter beforeUrl={x.beforeUrl} afterUrl={x.afterUrl} /><View style={{ padding: 16 }}><BrandText style={{ color: c.cyan, fontSize: 10, letterSpacing: 1 }}>{x.tag?.toUpperCase()}</BrandText><BrandText style={{ fontSize: 19, fontWeight: '600' }}>{x.title}</BrandText>{x.caption && <BrandText muted>{x.caption}</BrandText>}</View></Card>)}
    <SectionTitle>What customers say.</SectionTitle>
    {reviews.isPending ? <Card><BrandText muted>Loading reviews…</BrandText></Card> : reviews.isError ? <StateCard title="Reviews are unavailable" body="Please try again." action="Try again" onAction={() => reviews.refetch()} /> : reviews.data.length === 0 ? <StateCard title="No reviews yet" body="Customer reviews will appear here after completed services." /> : reviews.data.map(x => <Card key={x.id} style={{ marginBottom: 12 }}><View style={{ flexDirection: 'row', gap: 2 }}>{[1,2,3,4,5].map(n => <Star key={n} size={15} color={c.magenta} fill={n <= x.rating ? c.magenta : 'transparent'} />)}</View><BrandText style={{ fontWeight: '600', marginTop: 9 }}>{x.customerName}</BrandText>{x.body && <BrandText muted>{x.body}</BrandText>}</Card>)}
  </Screen>;
}
const styles = StyleSheet.create({ photos: { height: 190, overflow: 'hidden', backgroundColor: c.panelAlt }, fullImage: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }, afterClip: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' }, divider: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }, handle: { width: 31, height: 31, borderRadius: 16, backgroundColor: c.cyan, borderWidth: 2, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }, handleText: { fontSize: 13, fontWeight: '700', color: c.bg }, label: { color: 'white', fontSize: 10, position: 'absolute', bottom: 8, backgroundColor: '#000A', padding: 4 } });
