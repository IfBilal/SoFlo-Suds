import { Image, ImageBackground, StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { BrandText, Button } from '@/components/BrandUI';
import { useSession } from '@/lib/session';
import { font, palette as c } from '@/theme';

export default function Welcome() { const { user, loading } = useSession(); if (!loading && user) return <Redirect href="/(tabs)" />; return <View style={styles.root}><ImageBackground source={require('../assets/brand/porsche.jpg')} style={styles.image} imageStyle={{ opacity: .48 }}><View style={styles.shade}><Image source={require('../assets/brand/logo.webp')} style={styles.logo} resizeMode="contain" /><BrandText style={styles.head}>YOUR VEHICLE.{'\n'}ELEVATED.</BrandText><BrandText style={styles.copy}>Careful attention and clear communication for every surface you love.</BrandText></View></ImageBackground><View style={styles.actions}><Button label="Sign up" onPress={() => router.push('/signup')} /><Button label="Log in" variant="outline" onPress={() => router.push('/login')} style={{ marginTop: 10 }} /></View></View>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: c.bg }, image: { flex: 1, justifyContent: 'flex-end' }, shade: { paddingHorizontal: 24, paddingBottom: 30, paddingTop: 100, backgroundColor: '#080808B8' }, logo: { width: 210, height: 100, marginBottom: 26 }, head: { fontFamily: font.display, fontStyle: 'italic', fontSize: 38, lineHeight: 42 }, copy: { marginTop: 13, color: c.muted }, actions: { padding: 24, borderTopWidth: 2, borderColor: c.cyan } });
