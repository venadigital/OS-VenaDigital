import { useState } from 'react';
import { Download, KeyRound, Laptop, LogOut, Smartphone } from 'lucide-react';
import { subYears } from 'date-fns';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Card, CardHead, cx, Field, Input, Segmented } from '@/components/ui';
import { useAccount, useApi } from '@/data/ApiContext';
import { useToast } from '@/components/Toast';
import { ACCENTS } from '@/lib/palette';
import { saveAccent, storedAccent } from '@/lib/accent';
import { setThemePref, useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { dayKey } from '@/lib/time';
import { CollectorDialog } from '@/features/consumo/dialogs';

export function AjustesPage() {
  const { user, signOut, mode } = useAccount();
  const [accent, setAccent] = useState(storedAccent());
  const { pref: themePref, theme } = useTheme();
  const [collectorOpen, setCollectorOpen] = useState(false);

  return (
    <Page>
      <PageHeader eyebrow="Tu espacio de trabajo" title="Ajustes" />

      <div className="settings-grid">
      <Card className="settings-account">
        <CardHead title="Cuenta" />
        <div className="flex flex-col gap-1 text-[14px]">
          <span className="font-medium text-ink">{user.name}</span>
          <span className="text-ink-3">{mode === 'demo' ? 'Modo demo' : user.email}</span>
        </div>
        {mode === 'supabase' && <PasswordForm />}
        <Button icon={<LogOut size={15} />} className="self-start" onClick={() => void signOut()}>
          {mode === 'demo' ? 'Salir del modo demo' : 'Cerrar sesión'}
        </Button>
      </Card>

      <Card>
        <CardHead title="Apariencia" />
        <p className="text-sm text-ink-3">El tema y el color se guardan en este navegador. Los favoritos y la vista de tableros se recuerdan aquí para tu cuenta.</p>
        <div className="appearance-samples" aria-hidden="true"><div className="appearance-mini light-mini"><span /><div><i /><i /><i /></div><small>Claro</small></div><div className="appearance-mini dark-mini"><span /><div><i /><i /><i /></div><small>Oscuro</small></div></div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">Tema</span>
          <div className="self-start">
            <Segmented
              value={themePref}
              onChange={setThemePref}
              options={[
                { value: 'system', label: 'Sistema' },
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Oscuro' },
              ]}
            />
          </div>
          <span className="text-xs text-ink-3">«Sistema» cambia solo según el modo claro u oscuro de tu Mac o iPhone.</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">Color de acento</span>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => {
                  setAccent(a.value);
                  saveAccent(a.value);
                }}
                className={cx(
                  'flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium',
                  accent === a.value ? 'border-ink text-ink' : 'border-line-2 text-ink-2 hover:bg-plane',
                )}
              >
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: theme === 'dark' ? a.dark : a.value }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Colector de consumo IA" />
        <p className="text-[13.5px] leading-5 text-ink-2">
          Mide lo que usas en Claude Code y Codex desde tu Mac. Genera un token por equipo y revócalo cuando quieras.
        </p>
        <Button icon={<Laptop size={15} />} className="self-start" onClick={() => setCollectorOpen(true)}>
          Tokens y conexión
        </Button>
      </Card>

      <Card>
        <CardHead title="Usar en el iPhone" />
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] leading-5 text-ink-2">
          <li>Abre el OS en Safari.</li>
          <li>Toca Compartir y luego «Agregar a pantalla de inicio».</li>
          <li>Ábrelo desde el ícono: funciona a pantalla completa, como una app.</li>
        </ol>
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <Smartphone size={14} />
          El cronómetro se sincroniza en vivo entre el Mac y el celular.
        </div>
      </Card>

      <ExportCard />
      </div>

      <CollectorDialog open={collectorOpen} onClose={() => setCollectorOpen(false)} />
    </Page>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <Button variant="ghost" icon={<KeyRound size={15} />} className="self-start" onClick={() => setOpen(true)}>
        Cambiar contraseña
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!supabase) return;
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (error) toast(error.message, 'error');
        else {
          toast('Contraseña actualizada');
          setOpen(false);
          setPassword('');
        }
      }}
    >
      <Field label="Nueva contraseña">
        <Input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" disabled={busy || password.length < 8}>
        Guardar
      </Button>
    </form>
  );
}

function ExportCard() {
  const api = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const [projects, tasks, entries, notes, boards, accounts, prices, usage] = await Promise.all([
        api.listProjects(),
        api.listTasks(),
        api.listEntries(subYears(now, 5), new Date(now.getTime() + 86_400_000)),
        api.listNotes(),
        api.listBoards().then((list) => Promise.all(list.map((b) => api.getBoard(b.id)))),
        api.listAccounts(),
        api.listPrices(),
        api.listUsage(dayKey(subYears(now, 5)), dayKey(new Date(now.getTime() + 86_400_000))),
      ]);
      const blob = new Blob([JSON.stringify({ exported_at: now.toISOString(), projects, tasks, entries, notes, boards, accounts, prices, usage }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vena-os-${dayKey(now)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      toast(`No se pudo exportar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHead title="Tus datos" />
      <p className="text-[13.5px] leading-5 text-ink-2">Descarga una copia completa (tiempo, notas, tableros y consumo) en JSON.</p>
      <Button icon={<Download size={15} />} className="self-start" disabled={busy} onClick={() => void run()}>
        {busy ? 'Preparando…' : 'Exportar mis datos'}
      </Button>
    </Card>
  );
}
