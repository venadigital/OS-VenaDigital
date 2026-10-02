import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Download, Link2, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Empty, Pill, Segmented, Select, Skeleton, cx } from '@/components/ui';
import { downloader, useDownloaderStatus, type AudioFormat, type Job, type MediaInfo, type MediaKind, type VideoQuality } from './service';

const QUALITY: Record<VideoQuality, string> = {
  best: 'Máxima',
  2160: '4K',
  1440: '1440p',
  1080: '1080p',
  720: '720p',
  480: '480p',
  360: '360p',
};

const duration = (s?: number) => {
  if (!s) return '';
  const h = Math.floor(s / 3600),
    m = Math.floor(s / 60) % 60,
    sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const size = (b: number) =>
  b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;

function kindsOf(info: MediaInfo): MediaKind[] {
  const k: MediaKind[] = [];
  if (info.options.video.length) k.push('video');
  if (info.options.audio.length) k.push('audio');
  if (info.options.image) k.push('image');
  return k;
}

/** Hands a finished file to the browser (the service answers with Content-Disposition: attachment). */
function save(job: Job) {
  job.files.forEach((_, i) =>
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = downloader.fileUrl(job.id, i);
      a.download = '';
      document.body.append(a);
      a.click();
      a.remove();
    }, i * 600),
  );
}

export function DescargarPage() {
  const { desktop, available, checking } = useDownloaderStatus();
  if (!desktop) return <Navigate to="/" replace />; // not offered on the phone
  return (
    <Page>
      <PageHeader title="Descargar" />
      {checking ? (
        <Skeleton className="h-14 rounded-2xl" />
      ) : available ? (
        <Downloader />
      ) : (
        <Empty icon={<Download size={22} />} title="El servicio de descargas no está activo en este Mac" />
      )}
    </Page>
  );
}

function Downloader() {
  const [text, setText] = useState('');
  const [label, setLabel] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<MediaKind>('video');
  const [quality, setQuality] = useState<VideoQuality>('best');
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('mp3');
  const [job, setJob] = useState<Job | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect + inspect as soon as a link is pasted or typed (debounced, latest wins).
  useEffect(() => {
    const value = text.trim();
    setLabel(null);
    setInfo(null);
    setJob(null);
    setError(null);
    if (!value) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const d = await downloader.detect(value, ctrl.signal);
        setLabel(d.label);
        setLoading(true);
        const data = await downloader.inspect(value, ctrl.signal);
        const kinds = kindsOf(data);
        setInfo(data);
        setKind(kinds[0] ?? 'video');
        setQuality(data.options.video.includes('1080') ? '1080' : (data.options.video[0] ?? 'best'));
        setAudioFormat('mp3');
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const e = err as { code?: string; message?: string };
        if (e.code === 'invalid_url' && !/^https?:/i.test(value)) return; // still typing
        setError(e.message ?? 'Algo salió mal.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  // Follow the job until it ends; a ready file is handed over right away.
  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
    const t = setTimeout(async () => {
      try {
        const next = await downloader.job(job.id);
        setJob(next);
        if (next.status === 'ready') save(next);
        if (next.status === 'failed') setError(next.message ?? 'No se pudo descargar este enlace.');
      } catch (err) {
        setError((err as Error).message);
        setJob(null);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [job]);

  const busy = job?.status === 'queued' || job?.status === 'running';

  async function start() {
    if (!info) return;
    setError(null);
    try {
      setJob(await downloader.start({ url: info.url, kind, quality, audioFormat }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex max-w-[680px] flex-col gap-4">
      <div className="dl-bar flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-plane py-2 pr-2 pl-4 transition-shadow">
        <Link2 size={18} className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          type="url"
          inputMode="url"
          autoFocus
          autoComplete="off"
          placeholder="Pega un enlace de YouTube, Instagram, TikTok o X"
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink-4"
        />
        {label && <Pill className="bg-fill-2 text-ink-2">{label}</Pill>}
        {text && (
          <button
            type="button"
            aria-label="Borrar enlace"
            onClick={() => {
              setText('');
              inputRef.current?.focus();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-fill hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {error && <div className="rounded-xl bg-crit-soft px-4 py-3 text-[14px] text-crit">{error}</div>}

      {loading && !info && (
        <div className="flex gap-4 rounded-2xl border border-line p-4">
          <Skeleton className="aspect-[16/10] w-36 rounded-xl" />
          <div className="flex flex-1 flex-col justify-center gap-2">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-2/5" />
          </div>
        </div>
      )}

      {info && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex gap-4 p-4">
            <div
              className="relative aspect-[16/10] w-36 shrink-0 rounded-xl bg-fill bg-cover bg-center"
              style={
                info.thumbnail
                  ? {
                      backgroundImage: `url("${downloader.assetUrl(info.thumbnail)}")`,
                    }
                  : undefined
              }
            >
              {(info.durationSec || info.items > 1) && (
                <span className="tnum absolute right-1.5 bottom-1.5 rounded-md bg-black/60 px-1.5 text-[11px] font-semibold text-white">
                  {info.durationSec ? duration(info.durationSec) : info.items}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <div className="line-clamp-2 text-[15px] font-semibold text-ink">{info.title}</div>
              {info.author && <div className="truncate text-[13px] text-ink-3">{info.author}</div>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-plane px-4 py-3">
            {kindsOf(info).length > 1 && (
              <Segmented
                value={kind}
                onChange={(k) => {
                  setKind(k);
                  setJob(null);
                }}
                options={kindsOf(info).map((k) => ({
                  value: k,
                  label: k === 'video' ? 'Video' : k === 'audio' ? 'Audio' : info.items > 1 ? 'Imágenes' : 'Imagen',
                }))}
              />
            )}
            {kind === 'video' && info.options.video.length > 1 && (
              <div className="w-32">
                <Select aria-label="Calidad" value={quality} onChange={(e) => setQuality(e.target.value as VideoQuality)}>
                  {info.options.video.map((q) => (
                    <option key={q} value={q}>
                      {QUALITY[q]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {kind === 'audio' && info.options.audio.length > 1 && (
              <div className="w-32">
                <Select aria-label="Formato" value={audioFormat} onChange={(e) => setAudioFormat(e.target.value as AudioFormat)}>
                  {info.options.audio.map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Button variant="primary" className="ml-auto" icon={<Download size={16} />} disabled={busy} onClick={start}>
              Descargar
            </Button>
          </div>

          {busy && job && (
            <JobProgress
              job={job}
              onCancel={() =>
                void downloader
                  .cancel(job.id)
                  .then(setJob)
                  .catch(() => setJob(null))
              }
            />
          )}

          {job?.status === 'ready' && (
            <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
              {job.files.map((f, i) => (
                <a
                  key={f.name}
                  href={downloader.fileUrl(job.id, i)}
                  download
                  className="flex items-center justify-between gap-3 rounded-xl bg-plane px-3 py-2 text-[13.5px] text-ink hover:bg-fill"
                >
                  <span className="truncate">{f.name}</span>
                  <span className="tnum shrink-0 text-ink-3">{size(f.size)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JobProgress({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const p = job.progress;
  const pct = p?.percent != null ? Math.round(p.percent) : null;
  const status =
    job.status === 'queued'
      ? 'En cola'
      : p?.stage === 'processing'
        ? pct
          ? `Convirtiendo ${pct}%`
          : 'Preparando archivo'
        : pct != null
          ? `${pct}%`
          : p?.items
            ? `${p.items} listos`
            : 'Descargando';
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
        <div
          className={cx('h-full rounded-full bg-ink transition-[width] duration-300', pct == null && 'w-1/3 animate-pulse')}
          style={pct != null ? { width: `${pct}%` } : undefined}
        />
      </div>
      <span className="tnum text-[13px] whitespace-nowrap text-ink-3">{status}</span>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}
