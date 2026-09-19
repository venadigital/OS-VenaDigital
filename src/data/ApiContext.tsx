import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Api } from './api';
import { createDemoApi } from './demoApi';
import { createSupabaseApi } from './supabaseApi';
import { supabase } from '@/lib/supabase';

type Ctx = {
  api: Api;
  user: { id: string; email: string; name: string };
  signOut: () => Promise<void>;
};

const ApiContext = createContext<Ctx | null>(null);

const DEMO_KEY = 'vena-os-demo';

export function isDemoRequested(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('demo')) {
    sessionStorage.setItem(DEMO_KEY, '1');
    return true;
  }
  return sessionStorage.getItem(DEMO_KEY) === '1';
}

export function leaveDemo() {
  sessionStorage.removeItem(DEMO_KEY);
  window.location.href = '/';
}

function nameFromEmail(email: string) {
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[._-]/)[0] ?? local;
  return first ? first[0].toUpperCase() + first.slice(1) : 'Hola';
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const value = useMemo<Ctx>(
    () => ({ api: createDemoApi(), user: { id: 'demo', email: 'demo@vena.os', name: 'Laura' }, signOut: async () => leaveDemo() }),
    [],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function SupabaseProvider({ session, children }: { session: Session; children: ReactNode }) {
  const email = session.user.email ?? '';
  const displayName = (session.user.user_metadata?.name as string | undefined) || nameFromEmail(email);
  const value = useMemo<Ctx>(
    () => ({
      api: createSupabaseApi(supabase!),
      user: { id: session.user.id, email, name: displayName },
      signOut: async () => {
        await supabase!.auth.signOut();
      },
    }),
    [session.user.id, email, displayName],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useSupabaseSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, loading };
}

export function useApi(): Api {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi fuera de ApiProvider');
  return ctx.api;
}

export function useAccount() {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useAccount fuera de ApiProvider');
  return { user: ctx.user, signOut: ctx.signOut, mode: ctx.api.mode };
}
