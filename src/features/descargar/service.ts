import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * Client for the download service that runs on Laura's Mac (repo folder
 * `downloader/`). The OS only knows this HTTP contract, never which engine
 * does the work. Phones never reach the service, so the section stays hidden there.
 */
export const DOWNLOADER_URL = (import.meta.env.VITE_DOWNLOADER_URL?.trim() || 'http://127.0.0.1:4318').replace(/\/$/, '');

export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'x';
export type MediaKind = 'video' | 'audio' | 'image';
export type VideoQuality = 'best' | '2160' | '1440' | '1080' | '720' | '480' | '360';
export type AudioFormat = 'mp3' | 'm4a';

export type Detected = { platform: Platform; label: string; url: string };

export type MediaInfo = Detected & {
  title: string;
  author?: string;
  durationSec?: number;
  thumbnail?: string;
  items: number;
  options: { video: VideoQuality[]; audio: AudioFormat[]; image: boolean };
};

export type JobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';
export type Job = {
  id: string;
  status: JobStatus;
  kind: MediaKind;
  progress?: {
    stage: 'downloading' | 'processing';
    percent?: number;
    items?: number;
  };
  files: { name: string; size: number }[];
  error?: string;
  message?: string;
  expiresAt?: number;
};

export type JobRequest = {
  url: string;
  kind: MediaKind;
  quality?: VideoQuality;
  audioFormat?: AudioFormat;
};

export class DownloaderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${DOWNLOADER_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new DownloaderError('offline', 'El servicio de descargas no responde en este Mac.');
  }
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { code: string; message: string };
  };
  if (!res.ok) throw new DownloaderError(data.error?.code ?? 'error', data.error?.message ?? 'Algo salió mal.');
  return data;
}

export const downloader = {
  detect: (url: string, signal?: AbortSignal) => call<Detected>('/api/detect', { method: 'POST', body: { url }, signal }),
  inspect: (url: string, signal?: AbortSignal) => call<MediaInfo>('/api/inspect', { method: 'POST', body: { url }, signal }),
  start: (req: JobRequest) => call<Job>('/api/jobs', { method: 'POST', body: req }),
  job: (id: string) => call<Job>(`/api/jobs/${id}`),
  cancel: (id: string) => call<Job>(`/api/jobs/${id}`, { method: 'DELETE' }),
  fileUrl: (id: string, index: number) => `${DOWNLOADER_URL}/api/jobs/${id}/files/${index}`,
  assetUrl: (path?: string) => (path ? `${DOWNLOADER_URL}${path}` : undefined),
};

const DESKTOP = '(min-width: 768px) and (pointer: fine)';

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const on = () => setDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}

/**
 * Whether this device can use the downloader: a computer (never a phone) where
 * the local service answers. Phones don't even try to reach it.
 */
export function useDownloaderStatus(): { desktop: boolean; available: boolean; checking: boolean } {
  const desktop = useIsDesktop();
  const q = useQuery({
    queryKey: ['downloader', 'health'],
    queryFn: async () => {
      try {
        const res = await fetch(`${DOWNLOADER_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
        return res.ok && Boolean(((await res.json()) as { ok?: boolean }).ok);
      } catch {
        return false;
      }
    },
    enabled: desktop,
    retry: false,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  return { desktop, available: desktop && q.data === true, checking: desktop && q.isPending };
}
