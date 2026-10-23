import { useState } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandText, Button } from '@/components/BrandUI';
import { useSession } from '@/lib/session';
import { font, palette as c } from '@/theme';

const SLIDES = [
  { title: 'Certified team.', copy: 'Careful attention and clear communication for every surface you love.' },
  { title: 'Protection that lasts.', copy: 'Ceramic coating, paint protection film and tint, with your warranty kept on record.' },
  { title: 'Rewards.', copy: 'Earn points on every completed service and share your code with friends.' },
];

export default function Welcome() { const { user, loading } = useSession(); const { width } = useWindowDimensions(); const [slide, setSlide] = useState(0); const slideWidth = Math.max(240, Math.min(width, 430) - 48); if (!loading && user) return <Redirect href="/(tabs)" />; return <View style={styles.root}><View style={styles.image}><Image source={require('../assets/brand/porsche.jpg')} style={styles.backgroundPhoto} resizeMode="cover" /><LinearGradient pointerEvents="none" colors={['#08080833', '#080808CC', '#080808F5']} locations={[0, .58, 1]} style={StyleSheet.absoluteFill} /><View style={styles.shade}><Image source={require('../assets/brand/logo.webp')} style={styles.logo} resizeMode="contain" /><BrandText style={styles.head}>YOUR VEHICLE.{'\n'}ELEVATED.</BrandText><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 13 }} onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / slideWidth))} accessibilityLabel="Welcome highlights">{SLIDES.map((s) => <View key={s.title} style={{ width: slideWidth }}><BrandText style={styles.slideTitle}>{s.title}</BrandText><BrandText style={styles.copy}>{s.copy}</BrandText></View>)}</ScrollView><View style={styles.dots}>{SLIDES.map((s, i) => <View key={s.title} style={[styles.dot, i === slide && styles.dotOn]} />)}</View></View></View><View style={styles.actions}><Button label="Sign up" onPress={() => router.push('/signup')} /><Button label="Log in" variant="outline" onPress={() => router.push('/login')} style={{ marginTop: 10 }} /></View></View>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: c.bg, overflow: 'hidden' }, image: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' }, backgroundPhoto: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }, shade: { paddingHorizontal: 24, paddingBottom: 30, paddingTop: 100 }, logo: { width: 210, height: 100, marginBottom: 26 }, head: { fontFamily: font.display, fontStyle: 'italic', fontSize: 38, lineHeight: 42 }, copy: { marginTop: 6, color: c.muted }, slideTitle: { fontFamily: font.display, fontSize: 17, color: c.cyan }, dots: { flexDirection: 'row', gap: 7, marginTop: 14 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border }, dotOn: { backgroundColor: c.cyan }, actions: { padding: 24, borderTopWidth: 2, borderColor: c.cyan } });
