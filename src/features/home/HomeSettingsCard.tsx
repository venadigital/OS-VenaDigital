// "Inicio" in Ajustes: the weather city, the quotes and the photos that rotate on Inicio.
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, MapPin, Search, X } from 'lucide-react';
import { Button, Card, CardHead, Field, Input, Skeleton, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation, useHomePhotos, useHomeSettings } from '@/data/hooks';
import type { HomeQuote, HomeSettingsInput } from '@/data/types';
import { formatQuotes, MAX_PHOTOS, parseQuotes } from './daily';
import { preparePhoto } from './photo';
import { searchCities, type City } from './weather';

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function HomeSettingsCard() {
  const settings = useHomeSettings();
  const save = useApiMutation((api, patch: HomeSettingsInput) => api.saveHomeSettings(patch), [qk.homeSettings]);
  /** True when the change was saved; a failed save already shows its own message. */
  const savePatch = (patch: HomeSettingsInput) => save.mutateAsync(patch).then(() => true, () => false);
  const s = settings.data;

  return (
    <Card className="settings-home">
      <CardHead title="Inicio" />
      {settings.isLoading ? (
        <Skeleton className="h-32" />
      ) : !s ? (
        <p className="text-[13.5px] leading-5 text-ink-2">No se pudieron leer los ajustes del inicio. Intenta de nuevo en un momento.</p>
      ) : (
        <div className="settings-home-grid">
          <CitySection name={s.city_name} busy={save.isPending} onPick={(c) => savePatch({ city_name: c.name, city_lat: c.lat, city_lon: c.lon })} />
          <QuotesSection quotes={s.quotes} busy={save.isPending} onSave={(quotes) => savePatch({ quotes })} />
          <PhotosSection photos={s.photos} busy={save.isPending} onChange={(photos) => savePatch({ photos })} />
        </div>
      )}
    </Card>
  );
}

function CitySection({ name, busy, onPick }: { name: string | null; busy: boolean; onPick: (city: City) => Promise<boolean> }) {
  const toast = useToast();
  const [editing, setEditing] = useState(!name);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    setSearching(true);
    try {
      setResults(await searchCities(query));
    } catch (err) {
      toast(`No se pudo buscar la ciudad: ${message(err)}`, 'error');
    } finally {
      setSearching(false);
    }
  };
  const pick = async (city: City) => {
    if (!(await onPick(city))) return;
    setEditing(false);
    setResults(null);
    setQuery('');
  };

  return (
    <div>
      <h3>Ciudad del clima</h3>
      {name && !editing ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
            <MapPin size={16} className="shrink-0 text-ink-3" />
            <span className="truncate">{name}</span>
          </span>
          <Button size="sm" onClick={() => setEditing(true)}>
            Cambiar
          </Button>
        </div>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input aria-label="Ciudad" placeholder="Escribe tu ciudad" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" icon={<Search size={15} />} disabled={searching || query.trim().length < 2}>
              Buscar
            </Button>
          </form>
          {results &&
            (results.length ? (
              <div className="city-results">
                {results.map((c) => (
                  <button key={`${c.lat},${c.lon}`} type="button" disabled={busy} onClick={() => void pick(c)}>
                    {c.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">Sin resultados.</p>
            ))}
          {name && (
            <button type="button" className="text-link self-start" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          )}
        </>
      )}
    </div>
  );
}

function QuotesSection({ quotes, busy, onSave }: { quotes: HomeQuote[]; busy: boolean; onSave: (quotes: HomeQuote[]) => Promise<boolean> }) {
  const saved = formatQuotes(quotes);
  const [text, setText] = useState(saved);
  // Follow what is saved (a change made on the other device) unless something is being written.
  useEffect(() => setText(saved), [saved]);
  const dirty = formatQuotes(parseQuotes(text)) !== saved;

  return (
    <div>
      <Field label="Frases" hint="Una por línea. El autor va al final, después de un guion: La frase - Autor">
        <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button variant="primary" className="self-start" disabled={!dirty || busy} onClick={() => void onSave(parseQuotes(text))}>
        Guardar frases
      </Button>
    </div>
  );
}

function PhotosSection({ photos, busy, onChange }: { photos: string[]; busy: boolean; onChange: (photos: string[]) => Promise<boolean> }) {
  const api = useApi();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const urls = useHomePhotos(photos).data ?? {};
  const room = MAX_PHOTOS - photos.length;

  const add = async (files: File[]) => {
    if (!files.length) return;
    if (files.length > room) toast(`Caben ${MAX_PHOTOS} fotos: se suben las primeras ${room}`, 'error');
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of files.slice(0, room)) added.push(await api.uploadHomePhoto(await preparePhoto(file)));
    } catch (err) {
      toast(`No se pudo subir la foto: ${message(err)}`, 'error');
    }
    // Photos that did upload are kept even when a later one fails.
    if (added.length && !(await onChange([...photos, ...added]))) for (const path of added) void api.removeHomePhoto(path);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const remove = async (path: string) => {
    if (await onChange(photos.filter((p) => p !== path))) void api.removeHomePhoto(path);
  };

  return (
    <div>
      <h3>Fotos</h3>
      {photos.length > 0 && (
        <div className="home-photo-grid">
          {photos.map((path) => (
            <div key={path} className="home-photo">
              {urls[path] && <img src={urls[path]} alt="" />}
              <button type="button" aria-label="Quitar foto" title="Quitar foto" disabled={busy || uploading} onClick={() => void remove(path)}>
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept={PHOTO_TYPES} multiple className="hidden" onChange={(e) => void add([...(e.target.files ?? [])])} />
      <Button icon={<ImagePlus size={15} />} className="self-start" disabled={busy || uploading || room <= 0} onClick={() => fileRef.current?.click()}>
        {uploading ? 'Subiendo…' : 'Subir fotos'}
      </Button>
    </div>
  );
}
