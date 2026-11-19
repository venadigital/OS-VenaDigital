// Teleprompter: how a script's text is split into sections and paragraphs, how long it
// takes to read, and where the text sits on the screen while reading.
import type { Script, ScriptPlatform } from '@/data/types';

export const PLATFORM_LABEL: Record<ScriptPlatform, string> = { instagram: 'Instagram', youtube: 'YouTube' };

/** Scripts from before the text went in one piece had "# Gancho" lines: they are dropped. */
const HEADING = /^#(?:\s+.*)?$/;

/** The script as one continuous text. */
export function plainText(body: string): string {
  return body
    .split('\n')
    .filter((line) => !HEADING.test(line.trimEnd()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The list names a script by how it starts. */
export function scriptTitle(s: Pick<Script, 'title' | 'body'>): string {
  const own = s.title.trim();
  if (own) return own;
  const first = plainText(s.body).split('\n')[0]?.trim() ?? '';
  if (!first) return 'Sin texto';
  return first.length > 120 ? `${first.slice(0, 120).trimEnd()}…` : first;
}

// ---------------------------------------------------------------- reading
/** The blocks on the reading screen: blank lines separate them. */
export function paragraphs(body: string): string[] {
  return plainText(body)
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function wordCount(body: string): number {
  return plainText(body).match(/\S+/g)?.length ?? 0;
}

export function readingSeconds(body: string, wpm: number): number {
  return Math.round((wordCount(body) / wpm) * 60);
}

/** 65 → "1:05". */
export function minSec(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- reading screen
/** Which edge of the screen the camera is on: the text hugs that edge. */
export type Dock = 'top' | 'left' | 'right';
export type PrompterSettings = { wpm: number; size: number; dock: Dock; mirror: boolean };

export const WPM = { min: 60, max: 260, step: 5 };
export const SIZE = { min: 28, max: 96, step: 4 };
export const LINE_HEIGHT = 1.28;
export const DEFAULT_SETTINGS: PrompterSettings = { wpm: 150, size: 56, dock: 'top', mirror: false };

const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v));

/** A phone held at arm's length needs smaller letters than a monitor read from the chair. */
export const defaultSize = (screenWidth: number) => (screenWidth < 720 ? 32 : DEFAULT_SETTINGS.size);

/** Whatever was stored, as valid settings; `size` is used when none was stored. */
export function cleanSettings(raw: unknown, size = DEFAULT_SETTINGS.size): PrompterSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (x: unknown, fallback: number, range: { min: number; max: number }) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, range) : fallback);
  return {
    wpm: n(v.wpm, DEFAULT_SETTINGS.wpm, WPM),
    size: n(v.size, size, SIZE),
    dock: v.dock === 'left' || v.dock === 'right' ? v.dock : 'top',
    mirror: v.mirror === true,
  };
}

const SETTINGS_KEY = 'vena-os:teleprompter';

/** Reading settings belong to each device: a phone and a monitor need different sizes. */
export function loadSettings(): PrompterSettings {
  const size = defaultSize(window.innerWidth);
  try {
    return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'), size);
  } catch {
    return { ...DEFAULT_SETTINGS, size };
  }
}

export function saveSettings(settings: PrompterSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Reading still works when the browser can't store them. */
  }
}

export type Layout = {
  /** Left edge and width of the text column. */
  left: number;
  width: number;
  /** Where the line being read sits, from the top of the screen. */
  lineY: number;
  /** The dock in use: a narrow screen only fits the text on top. */
  dock: Dock;
};

/**
 * A short column on the camera's side keeps the eyes near the lens: centred under a camera
 * on top of the screen, or against the side the camera stands on, at eye level.
 */
export function layout(dock: Dock, width: number, height: number): Layout {
  if (dock === 'top' || width < 720) {
    const w = Math.max(160, Math.min(860, width - 96));
    return { left: Math.round((width - w) / 2), width: w, lineY: Math.round(Math.max(72, height * 0.13)), dock: 'top' };
  }
  const w = Math.min(640, Math.round(width * 0.44));
  const margin = Math.max(64, Math.round(width * 0.06));
  return { left: dock === 'left' ? margin : width - w - margin, width: w, lineY: Math.round(height * 0.37), dock };
}

/**
 * Scroll speed that reads `words` in the time the pace asks for, whatever the font and
 * column: the text's own height sets how far one word moves it.
 */
export function pixelsPerSecond(wpm: number, words: number, textHeight: number): number {
  if (words <= 0 || textHeight <= 0) return 0;
  return (wpm / 60) * (textHeight / words);
}
