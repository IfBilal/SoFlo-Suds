import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, ChevronRight, Shield } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { font, palette as c } from '@/theme';

export function BrandText({ children, style, muted = false }: { children: ReactNode; style?: object; muted?: boolean }) {
  return <Text style={[styles.text, muted && { color: c.muted }, style]}>{children}</Text>;
}

export function Screen({ children, title, subtitle, header = true }: { children: ReactNode; title?: string; subtitle?: string; header?: boolean }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const showBack = pathname !== '/' && pathname !== '/welcome';
  return <View style={styles.root}>
    {header && <View style={[styles.header, { paddingHorizontal: showBack ? 13 : 18, paddingTop: Math.max(insets.top, 12), height: 65 + Math.max(insets.top, 12) }]}>
      <View style={styles.headerStart}>
        {showBack && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backButton}><ArrowLeft size={16} color={c.cyan} strokeWidth={1.6} /><BrandText style={styles.backLabel}>Back</BrandText></Pressable>}
        <Image source={require('../assets/brand/logo.webp')} style={styles.logo} resizeMode="contain" />
      </View>
      <Pressable accessibilityLabel="Notification settings" onPress={() => router.push('/notifications' as never)} style={styles.headerIcon}><Bell size={19} color={c.cyan} strokeWidth={1.6} /></Pressable>
    </View>}
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      {title && <View style={styles.titleBlock}><BrandText style={styles.h1}>{title}</BrandText>{subtitle && <BrandText muted style={styles.subtitle}>{subtitle}</BrandText>}</View>}
      {children}
    </ScrollView>
  </View>;
}

export function Card({ children, accent, style }: { children: ReactNode; accent?: 'cyan' | 'magenta'; style?: object }) {
  return <View style={[styles.card, accent && { borderColor: c[accent] }, style]}>{children}</View>;
}

export function SectionTitle({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return <View style={styles.section}><View style={styles.sectionLine} /><BrandText style={styles.h2}>{children}</BrandText>{action && <Pressable onPress={onAction} style={styles.sectionAction}><BrandText style={styles.link}>{action} →</BrandText></Pressable>}</View>;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, style }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'outline'; disabled?: boolean; style?: object }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === 'secondary' && styles.buttonSecondary, variant === 'outline' && styles.buttonOutline, disabled && { opacity: .45 }, pressed && { opacity: .78 }, style]}><BrandText style={[styles.buttonText, variant === 'secondary' && { color: c.darkOnCyan }, variant === 'outline' && { color: c.cyan }]}>{label}</BrandText></Pressable>;
}

export function RowLink({ icon, title, subtitle, onPress }: { icon?: ReactNode; title: string; subtitle?: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.row}><View style={styles.iconTile}>{icon ?? <Shield size={19} color={c.cyan} strokeWidth={1.6} />}</View><View style={{ flex: 1 }}><BrandText style={styles.rowTitle}>{title}</BrandText>{subtitle && <BrandText muted style={styles.rowSubtitle}>{subtitle}</BrandText>}</View><ChevronRight size={18} color={c.muted} strokeWidth={1.6} /></Pressable>;
}

export function StateCard({ title, body, action, onAction, icon }: { title: string; body: string; action?: string; onAction?: () => void; icon?: ReactNode }) {
  return <Card style={{ alignItems: 'center', paddingVertical: 34 }}><View style={styles.stateIcon}>{icon ?? <Shield size={27} color={c.cyan} strokeWidth={1.6} />}</View><BrandText style={[styles.h2, { textAlign: 'center', marginTop: 16 }]}>{title}</BrandText><BrandText muted style={{ textAlign: 'center', marginTop: 9, marginBottom: 18 }}>{body}</BrandText>{action && onAction && <Button label={action} onPress={onAction} />}</Card>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: c.cyan, backgroundColor: c.bg },
  headerStart: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { minWidth: 69, height: 38, borderWidth: 1, borderColor: c.cyan, borderRadius: 8, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  backLabel: { color: c.cyan, fontSize: 12 },
  logo: { width: 123, height: 52 },
  headerIcon: { width: 37, height: 37, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 }, content: { paddingTop: 23, paddingHorizontal: 19 },
  text: { color: c.text, fontFamily: font.body, fontSize: 14, lineHeight: 22 },
  titleBlock: { marginBottom: 21 }, h1: { fontSize: 27, lineHeight: 33, fontFamily: font.body, fontWeight: '600', letterSpacing: -.8 },
  subtitle: { fontSize: 12, lineHeight: 19, marginTop: 5 },
  card: { borderWidth: 1, borderColor: c.border, backgroundColor: c.panel, borderRadius: 12, padding: 18 },
  section: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 32, marginBottom: 14 },
  sectionLine: { width: 3, height: 17, borderRadius: 2, backgroundColor: c.magenta },
  h2: { fontSize: 20, lineHeight: 25, fontWeight: '600', flexShrink: 1 },
  sectionAction: { marginLeft: 'auto' }, link: { color: c.cyan, fontSize: 12 },
  button: { minHeight: 46, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: c.magenta, borderWidth: 1, borderColor: c.magenta, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: c.cyan, borderColor: c.cyan }, buttonOutline: { backgroundColor: c.bg, borderColor: c.cyan },
  buttonText: { color: 'white', fontWeight: '600', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
  iconTile: { width: 38, height: 38, borderColor: c.cyan, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  rowTitle: { fontWeight: '600', fontSize: 15 }, rowSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  stateIcon: { width: 54, height: 54, borderColor: c.cyan, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
});
