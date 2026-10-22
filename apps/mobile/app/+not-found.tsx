import { router } from 'expo-router';
import { Screen, StateCard } from '@/components/BrandUI';
export default function NotFound() { return <Screen title="Page not found." subtitle="Let’s get you back to SoFlo Suds."><StateCard title="That page isn’t here" body="The link may have changed." action="Go home" onAction={() => router.replace('/(tabs)')} /></Screen>; }
