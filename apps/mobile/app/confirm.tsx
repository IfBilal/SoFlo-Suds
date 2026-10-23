import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BrandText, Button, Card, Screen } from '@/components/BrandUI';
import { endpoints } from '@/lib/api';
import { linkProblem } from '@/lib/authLinks';
import { useSession } from '@/lib/session';

/** Landing screen for the signup confirmation email (soflosuds://confirm?code=...). */
export default function ConfirmEmail() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_code?: string }>();
  const { adoptSession } = useSession();
  const [state, setState] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; started.current = true;
    const problem = linkProblem(params);
    if (problem) { setMessage(problem); setState('error'); return; }
    (async () => {
      try { await endpoints.confirmEmail(params.code as string); await adoptSession(); router.replace('/(tabs)'); }
      catch (e) { setMessage(e instanceof Error ? e.message : 'Please try again.'); setState('error'); }
    })();
  }, []);

  return (
    <Screen title={state === 'working' ? 'Confirming your email…' : 'We couldn’t confirm that link.'} subtitle={state === 'working' ? 'One moment.' : undefined}>
      {state === 'error' && <Card><BrandText muted style={{ marginBottom: 16 }}>{message}</BrandText><Button label="Log in" onPress={() => router.replace('/login')} /><Button label="Sign up again" variant="secondary" onPress={() => router.replace('/signup')} style={{ marginTop: 10 }} /></Card>}
    </Screen>
  );
}
