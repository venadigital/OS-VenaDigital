import { useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Field, Input } from '@/components/ui';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-plane px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/vena-isotipo.png" alt="" className="h-14 w-14" />
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Vena OS</h1>
            <p className="text-[14px] text-ink-3">Tu sistema operativo de trabajo</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const demoHref = '/?demo';

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setMessage({ kind: 'info', text: 'Te enviamos un correo para confirmar la cuenta. Ábrelo y vuelve a entrar.' });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/ajustes` });
        if (error) throw error;
        setMessage({ kind: 'info', text: 'Si el correo existe, te llegará un enlace para crear una contraseña nueva.' });
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setMessage({ kind: 'error', text: text === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[17px] font-semibold">{mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear tu cuenta' : 'Recuperar contraseña'}</h2>
        <Field label="Correo">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== 'reset' && (
          <Field label="Contraseña" hint={mode === 'signup' ? 'Mínimo 8 caracteres.' : undefined}>
            <Input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {message && <p className={message.kind === 'error' ? 'text-[13px] text-crit' : 'text-[13px] text-ink-2'}>{message.text}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
          {busy ? 'Un momento…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-[13px]">
          {mode === 'signin' ? (
            <>
              <button type="button" className="font-medium text-accent" onClick={() => setMode('signup')}>
                Crear cuenta
              </button>
              <button type="button" className="text-ink-3 hover:text-ink-2" onClick={() => setMode('reset')}>
                ¿Olvidaste la contraseña?
              </button>
            </>
          ) : (
            <button type="button" className="font-medium text-accent" onClick={() => setMode('signin')}>
              Ya tengo cuenta
            </button>
          )}
        </div>
      </form>
      <a href={demoHref} className="text-center text-[13px] text-ink-3 hover:text-ink-2">
        Explorar en modo demo →
      </a>
    </AuthLayout>
  );
}

export function SetupPage() {
  return (
    <AuthLayout>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 text-[14px] leading-6 text-ink-2">
        <h2 className="text-[17px] font-semibold text-ink">Falta conectar Supabase</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Crea un proyecto en Supabase para el OS.</li>
          <li>
            Ejecuta <code className="rounded bg-fill px-1 font-mono text-[12.5px]">supabase/setup.sql</code> en el SQL Editor.
          </li>
          <li>
            Pon la URL y la llave publicable en <code className="rounded bg-fill px-1 font-mono text-[12.5px]">.env.local</code> y en{' '}
            <code className="rounded bg-fill px-1 font-mono text-[12.5px]">.env.production</code>.
          </li>
        </ol>
        <p className="text-[13px] text-ink-3">El paso a paso está en el README del repositorio.</p>
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={() => (window.location.href = demoHref)}>
        Explorar en modo demo
      </Button>
    </AuthLayout>
  );
}
