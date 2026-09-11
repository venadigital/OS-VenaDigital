import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { Button, ColorSwatches, Dialog, Field, IconButton, Input, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { qk, useApiMutation, useCollectorTokens } from '@/data/hooks';
import type { AccountInput } from '@/data/api';
import type { AiAccount, ModelPrice, ModelPriceInput, Provider } from '@/data/types';
import { SERIES } from '@/lib/palette';
import { supabaseKey, supabaseUrl } from '@/lib/supabase';
import { relativeDay } from '@/lib/format';

const numberOr = (v: string, fallback = 0) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function PriceDialog({ model, price, onClose }: { model: string | null; price?: ModelPrice; onClose: () => void }) {
  const [name, setName] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [cacheRead, setCacheRead] = useState('');
  const [cacheWrite, setCacheWrite] = useState('');
  const [cacheWrite1h, setCacheWrite1h] = useState('');
  useEffect(() => {
    if (model === null) return;
    setName(price?.model ?? model);
    setInput(price ? String(price.input) : '');
    setOutput(price ? String(price.output) : '');
    setCacheRead(price ? String(price.cache_read) : '');
    setCacheWrite(price ? String(price.cache_write) : '');
    setCacheWrite1h(price ? String(price.cache_write_1h) : '');
  }, [model, price]);

  const save = useApiMutation((api, v: ModelPriceInput) => api.upsertPrice(v), [qk.prices]);
  const valid = name.trim() && input !== '' && output !== '';

  return (
    <Dialog
      open={model !== null}
      onClose={onClose}
      title={price ? 'Editar precio' : 'Definir precio'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!valid || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  model: name.trim(),
                  input: numberOr(input),
                  output: numberOr(output),
                  cache_read: numberOr(cacheRead),
                  cache_write: numberOr(cacheWrite),
                  cache_write_1h: numberOr(cacheWrite1h),
                },
                { onSuccess: onClose },
              )
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Modelo" hint="El id exacto que aparece en los registros, p. ej. gpt-5.6-sol.">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono text-[13px]" disabled={Boolean(price)} />
      </Field>
      <p className="text-[12.5px] text-ink-3">USD por millón de tokens.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Entrada">
          <Input inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} placeholder="1,75" />
        </Field>
        <Field label="Salida">
          <Input inputMode="decimal" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="14" />
        </Field>
        <Field label="Caché (lectura)">
          <Input inputMode="decimal" value={cacheRead} onChange={(e) => setCacheRead(e.target.value)} placeholder="0,175" />
        </Field>
        <Field label="Caché (escritura 5 min)">
          <Input inputMode="decimal" value={cacheWrite} onChange={(e) => setCacheWrite(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Caché (escritura 1 h)">
          <Input inputMode="decimal" value={cacheWrite1h} onChange={(e) => setCacheWrite1h(e.target.value)} placeholder="0" />
        </Field>
      </div>
    </Dialog>
  );
}

export function PricesDialog({ open, onClose, prices, onEdit }: { open: boolean; onClose: () => void; prices: ModelPrice[]; onEdit: (p: ModelPrice | null) => void }) {
  const remove = useApiMutation((api, id: string) => api.deletePrice(id), [qk.prices]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Tabla de precios"
      width={640}
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-ink-3">USD por millón de tokens · verifica en las páginas de precios oficiales</span>
          <Button variant="primary" onClick={() => onEdit(null)}>
            Agregar modelo
          </Button>
        </>
      }
    >
      <div className="-mx-1 max-h-[55vh] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-white text-left text-xs text-ink-3">
            <tr>
              <th className="px-1 py-2 font-medium">Modelo</th>
              <th className="px-1 py-2 text-right font-medium">Entrada</th>
              <th className="px-1 py-2 text-right font-medium">Salida</th>
              <th className="px-1 py-2 text-right font-medium">Caché</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.id} className="border-t border-rule">
                <td className="px-1 py-2 font-mono text-[12.5px]">
                  <button type="button" className="text-left hover:text-accent" onClick={() => onEdit(p)}>
                    {p.model}
                  </button>
                </td>
                <td className="tnum px-1 py-2 text-right text-ink-2">{p.input}</td>
                <td className="tnum px-1 py-2 text-right text-ink-2">{p.output}</td>
                <td className="tnum px-1 py-2 text-right text-ink-2">{p.cache_read}</td>
                <td className="w-8 px-1 py-1 text-right">
                  <IconButton label={`Borrar ${p.model}`} size={28} onClick={() => confirm(`¿Borrar el precio de ${p.model}?`) && remove.mutate(p.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export function AccountDialog({
  state,
  onClose,
  usedColors,
}: {
  state: { account?: AiAccount; draft?: Partial<AccountInput> } | null;
  onClose: () => void;
  usedColors: string[];
}) {
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [label, setLabel] = useState('');
  const [plan, setPlan] = useState('');
  const [email, setEmail] = useState('');
  const [price, setPrice] = useState('');
  const [renews, setRenews] = useState('');
  const [color, setColor] = useState(SERIES[1]);

  useEffect(() => {
    if (!state) return;
    const a = state.account ?? state.draft;
    setProvider(a?.provider ?? 'anthropic');
    setLabel(a?.label ?? '');
    setPlan(a?.plan ?? '');
    setEmail(a?.email ?? '');
    setPrice(a?.monthly_price != null ? String(a.monthly_price) : '');
    setRenews(a?.renews_day ? String(a.renews_day) : '');
    setColor(a?.color ?? SERIES.find((c) => !usedColors.includes(c)) ?? SERIES[1]);
    // usedColors is only needed to pick a default color when the dialog opens
  }, [state]);

  const save = useApiMutation(
    async (api, v: AccountInput) => {
      if (state?.account) await api.updateAccount(state.account.id, v);
      else await api.createAccount(v);
    },
    [qk.accounts],
  );
  const remove = useApiMutation((api, id: string) => api.deleteAccount(id), [qk.accounts]);

  const input: AccountInput = {
    provider,
    label: label.trim(),
    plan: plan.trim() || null,
    email: email.trim().toLowerCase() || null,
    monthly_price: numberOr(price),
    renews_day: renews ? Math.min(31, Math.max(1, Math.round(numberOr(renews, 1)))) : null,
    color,
  };

  return (
    <Dialog
      open={Boolean(state)}
      onClose={onClose}
      title={state?.account ? 'Editar cuenta' : 'Nueva cuenta'}
      footer={
        <>
          {state?.account && (
            <Button
              variant="ghost"
              className="mr-auto text-crit"
              onClick={() => confirm('¿Quitar esta cuenta? El consumo quedará como "cuenta detectada".') && remove.mutate(state.account!.id, { onSuccess: onClose })}
            >
              Quitar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!input.label || save.isPending} onClick={() => save.mutate(input, { onSuccess: onClose })}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proveedor">
          <Select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="openai">ChatGPT / Codex (OpenAI)</option>
          </Select>
        </Field>
        <Field label="Nombre">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Personal" />
        </Field>
        <Field label="Plan">
          <Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={provider === 'anthropic' ? 'Claude Max 5x' : 'ChatGPT Plus'} />
        </Field>
        <Field label="Precio mensual (USD)">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="20" />
        </Field>
      </div>
      <Field
        label="Correo de la cuenta"
        hint={provider === 'anthropic' ? 'El colector asigna el consumo de Claude Code a la cuenta con este correo.' : 'Opcional: el consumo de Codex va a tu cuenta de OpenAI.'}
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
      </Field>
      <div className="grid grid-cols-[120px_1fr] items-end gap-3">
        <Field label="Renueva el día">
          <Input inputMode="numeric" value={renews} onChange={(e) => setRenews(e.target.value)} placeholder="24" />
        </Field>
        <Field label="Color">
          <ColorSwatches colors={SERIES.slice(0, 6)} value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  );
}

export function CollectorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const tokens = useCollectorTokens();
  const [label, setLabel] = useState('MacBook');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) {
      setToken(null);
      setCopied(false);
    }
  }, [open]);

  const create = useApiMutation((api, l: string) => api.createCollectorToken(l), [qk.collectorTokens]);
  const revoke = useApiMutation((api, id: string) => api.revokeCollectorToken(id), [qk.collectorTokens]);

  const command = token
    ? `node collector/collector.mjs setup --url ${supabaseUrl || '<SUPABASE_URL>'} --key ${supabaseKey || '<LLAVE_PUBLICABLE>'} --token ${token}\nnode collector/collector.mjs install`
    : '';

  return (
    <Dialog open={open} onClose={onClose} title="Conectar un equipo" width={600}>
      <p className="text-[13.5px] leading-5 text-ink-2">
        El colector corre en tu Mac: lee los registros de Claude Code (<code className="font-mono text-[12.5px]">~/.claude</code>) y Codex (
        <code className="font-mono text-[12.5px]">~/.codex</code>), anota qué cuenta de Claude tiene la sesión activa y sube los totales cada 5 minutos. Solo
        sube conteos de tokens por día y modelo, nunca el contenido de tus conversaciones.
      </p>
      {!token ? (
        <div className="flex items-end gap-2">
          <Field label="Nombre del equipo">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button
            variant="primary"
            icon={<KeyRound size={15} />}
            disabled={!label.trim() || create.isPending}
            onClick={() => create.mutate(label.trim(), { onSuccess: (t) => setToken(t) })}
          >
            Generar token
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-ink">En la carpeta del proyecto, corre en la Terminal:</p>
          <div className="relative">
            <pre className="overflow-x-auto rounded-[10px] bg-[#1f1e1c] p-3.5 pr-12 font-mono text-[12px] leading-5 whitespace-pre text-[#f2f1ed]">{command}</pre>
            <button
              type="button"
              aria-label="Copiar"
              className="absolute top-2 right-2 rounded-md bg-white/10 p-1.5 text-white hover:bg-white/20"
              onClick={() => {
                void navigator.clipboard.writeText(command).then(() => {
                  setCopied(true);
                  toast('Comando copiado');
                });
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-[12.5px] text-ink-3">El token se muestra solo esta vez. Guárdalo en tu gestor de contraseñas si lo necesitas para otro equipo.</p>
        </div>
      )}
      {(tokens.data ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12.5px] font-semibold text-ink-3">Tokens</div>
          {(tokens.data ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-t border-rule py-2 text-[13px]">
              <span className="flex-1 text-ink">{t.label}</span>
              <span className="text-ink-3">
                {t.revoked_at ? 'Revocado' : t.last_used_at ? `Usado ${relativeDay(new Date(t.last_used_at)).toLowerCase()}` : 'Sin usar'}
              </span>
              {!t.revoked_at && (
                <Button size="sm" variant="ghost" onClick={() => confirm('¿Revocar este token? El colector de ese equipo dejará de subir datos.') && revoke.mutate(t.id)}>
                  Revocar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
