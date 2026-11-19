import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useScripts } from '@/data/hooks';
import type { Script } from '@/data/types';
import {
  layout,
  LINE_HEIGHT,
  loadSettings,
  minSec,
  paragraphs,
  pixelsPerSecond,
  readingSeconds,
  saveSettings,
  SIZE,
  wordCount,
  WPM,
  type Dock,
  type PrompterSettings,
} from './model';
import './teleprompter.css';

const DOCKS: { value: Dock; label: string }[] = [
  { value: 'top', label: 'Arriba' },
  { value: 'left', label: 'Izquierda' },
  { value: 'right', label: 'Derecha' },
];
/** With the text moving, the controls leave after this long without the pointer. */
const IDLE_MS = 2200;

export function PrompterPage() {
  const { id = '' } = useParams();
  const scripts = useScripts();
  const navigate = useNavigate();
  const script = scripts.data?.find((s) => s.id === id);
  if (scripts.isLoading) return <Centered>Abriendo guion…</Centered>;
  if (!script)
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <span>No encontramos este guion.</span>
          <Button onClick={() => navigate('/teleprompter')}>Volver a Teleprompter</Button>
        </div>
      </Centered>
    );
  return <Reader key={script.id} script={script} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center text-[14px] text-ink-3">{children}</div>;
}

function Reader({ script }: { script: Script }) {
  const navigate = useNavigate();
  // The text as it was when reading began: a refresh must not move it under the eyes.
  const [body] = useState(script.body);
  const blocks = useMemo(() => paragraphs(body), [body]);
  const words = useMemo(() => wordCount(body), [body]);
  const [settings, setSettings] = useState(loadSettings);
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [playing, setPlaying] = useState(false);
  /** Seconds left before the text starts moving, while counting down. */
  const [count, setCount] = useState<number | null>(null);
  const [idle, setIdle] = useState(false);
  const [second, setSecond] = useState(0);
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement));

  const root = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // The position changes every frame, so it lives outside React and is written straight to the element.
  const y = useRef(0);
  const maxY = useRef(0);
  const speed = useRef(0);

  const lay = layout(settings.dock, view.w, view.h);
  const lineH = settings.size * LINE_HEIGHT;
  const total = readingSeconds(body, settings.wpm);
  const totalRef = useRef(total);
  totalRef.current = total;

  const moveTo = useCallback((next: number) => {
    const v = Math.min(maxY.current, Math.max(0, next));
    y.current = v;
    if (text.current) text.current.style.transform = `translate3d(0, ${-v}px, 0)`;
    setSecond(maxY.current > 0 ? Math.floor((v / maxY.current) * totalRef.current) : 0);
  }, []);

  // A new size or column changes how tall the text is: keep the same place in it.
  useLayoutEffect(() => {
    const h = content.current?.offsetHeight ?? 0;
    const progress = maxY.current > 0 ? y.current / maxY.current : 0;
    maxY.current = Math.max(0, h - lineH);
    speed.current = pixelsPerSecond(settings.wpm, words, h);
    moveTo(progress * maxY.current);
  }, [settings.size, settings.wpm, lay.width, lineH, words, blocks, moveTo]);

  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFull);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // The screen must not sleep in the middle of a take.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const ask = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
        if (!alive) void lock?.release();
      } catch {
        /* Not every browser allows it; reading works the same. */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ask();
    };
    void ask();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // ---------- Movement ----------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      // A tab left in the background must not jump ahead when it comes back.
      const dt = last ? Math.min(100, t - last) : 0;
      last = t;
      moveTo(y.current + (speed.current * dt) / 1000);
      if (y.current >= maxY.current) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, moveTo]);

  useEffect(() => {
    if (count == null) return;
    if (count === 0) {
      setCount(null);
      setPlaying(true);
      return;
    }
    const t = setTimeout(() => setCount((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count]);

  const toggle = () => {
    if (count != null) return setCount(null);
    if (playing) return setPlaying(false);
    if (y.current >= maxY.current - 1) moveTo(0);
    // From the top there is a moment to look at the camera before the text moves.
    if (y.current < 1) setCount(3);
    else setPlaying(true);
  };
  const restart = () => {
    setPlaying(false);
    setCount(null);
    moveTo(0);
  };
  const jump = (dir: 1 | -1) => {
    // Each paragraph's first line lands on the reading line.
    const tops = Array.from(content.current?.querySelectorAll('p') ?? []).map((el) => el.offsetTop);
    if (dir > 0) {
      const next = tops.find((t) => t > y.current + 2);
      if (next != null) moveTo(next);
    } else {
      // First back to the start of this paragraph, then to the one before.
      moveTo([...tops].reverse().find((t) => t < y.current - lineH * 0.6) ?? 0);
    }
  };
  const update = (patch: Partial<PrompterSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  const step = (key: 'wpm' | 'size', dir: 1 | -1) => {
    const range = key === 'wpm' ? WPM : SIZE;
    update({ [key]: Math.min(range.max, Math.max(range.min, settings[key] + dir * range.step)) });
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void root.current?.requestFullscreen?.().catch(() => undefined);
  };
  const close = () => navigate(`/teleprompter?guion=${script.id}`, { replace: true });

  // ---------- Controls that hide ----------
  const active = playing || count != null;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => {
    if (active) wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [active, wake]);

  // ---------- Keyboard (a presentation remote sends the same keys) ----------
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const actions: Record<string, () => void> = {
      ' ': toggle,
      k: toggle,
      ArrowUp: () => step('wpm', 1),
      ArrowDown: () => step('wpm', -1),
      ArrowLeft: () => jump(-1),
      PageUp: () => jump(-1),
      ArrowRight: () => jump(1),
      PageDown: () => jump(1),
      '+': () => step('size', 1),
      '=': () => step('size', 1),
      '-': () => step('size', -1),
      m: () => update({ mirror: !settings.mirror }),
      f: toggleFull,
      r: restart,
      Home: restart,
      Escape: () => {
        if (!document.fullscreenElement) close();
      },
    };
    const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!action) return;
    e.preventDefault();
    wake();
    action();
  };
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keys.current(e);
    // Space always means play or pause, also with a button of the bar in focus.
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') e.preventDefault();
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
  }, []);

  // ---------- Dragging the text; a tap pauses ----------
  const drag = useRef<{ id: number; startY: number; from: number; moved: boolean } | null>(null);

  return (
    <div ref={root} className="tp-read" data-idle={idle && active} onPointerMove={wake}>
      <div
        className="tp-read-stage"
        style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}
        onWheel={(e) => moveTo(y.current + e.deltaY)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { id: e.pointerId, startY: e.clientY, from: y.current, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dy = e.clientY - d.startY;
          if (Math.abs(dy) > 6) d.moved = true;
          if (d.moved) moveTo(d.from - dy);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) toggle();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="tp-read-column" style={{ left: lay.left, width: lay.width }}>
          <div ref={text} className="tp-read-text" style={{ paddingTop: lay.lineY, paddingBottom: view.h, fontSize: settings.size, lineHeight: LINE_HEIGHT }}>
            <div ref={content} className="tp-read-content">
              {blocks.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
          </div>
        </div>
        <div className="tp-read-fade" style={{ top: 0, height: Math.max(0, lay.lineY - 24), background: 'linear-gradient(#000 35%, transparent)' }} />
        <div className="tp-read-fade" style={{ top: lay.lineY + lineH * 3.3, bottom: 0, background: 'linear-gradient(transparent, rgb(0 0 0 / .84) 260px)' }} />
        <div className="tp-read-marker" aria-hidden style={{ left: lay.left - 36, top: lay.lineY + lineH / 2 - 9 }} />
        {count != null && (
          <div className="tp-read-count" aria-live="assertive">
            {count}
          </div>
        )}
      </div>

      <div className="tp-bar-wrap">
        <div className="tp-bar" role="toolbar" aria-label="Controles de lectura">
          <button type="button" className="tp-bar-play" aria-label={active ? 'Pausar' : 'Reproducir'} onClick={toggle}>
            {active ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}
          </button>
          <button type="button" className="tp-bar-plain" aria-label="Volver al inicio" title="Volver al inicio" onClick={restart}>
            <RotateCcw size={18} />
          </button>
          <span className="tp-bar-clock">
            {minSec(second)} <span>/ {minSec(total)}</span>
          </span>
          <span className="tp-bar-rule" aria-hidden />
          <div className="tp-bar-group" role="group" aria-label="Velocidad en palabras por minuto">
            <span className="tp-bar-label">Velocidad</span>
            <button type="button" className="tp-bar-step" aria-label="Más lento" onClick={() => step('wpm', -1)} disabled={settings.wpm <= WPM.min}>
              <Minus size={16} />
            </button>
            <span className="tp-bar-value">{settings.wpm}</span>
            <button type="button" className="tp-bar-step" aria-label="Más rápido" onClick={() => step('wpm', 1)} disabled={settings.wpm >= WPM.max}>
              <Plus size={16} />
            </button>
          </div>
          <div className="tp-bar-group" role="group" aria-label="Tamaño de letra">
            <span className="tp-bar-label">Tamaño</span>
            <button type="button" className="tp-bar-step" aria-label="Letra más pequeña" onClick={() => step('size', -1)} disabled={settings.size <= SIZE.min}>
              <Minus size={16} />
            </button>
            <span className="tp-bar-value">{settings.size}</span>
            <button type="button" className="tp-bar-step" aria-label="Letra más grande" onClick={() => step('size', 1)} disabled={settings.size >= SIZE.max}>
              <Plus size={16} />
            </button>
          </div>
          <span className="tp-bar-rule" aria-hidden />
          <div className="tp-bar-group tp-bar-camera" role="group" aria-label="Lado de la cámara">
            <span className="tp-bar-label">Cámara</span>
            <div className="tp-bar-docks">
              {DOCKS.map((d) => (
                <button key={d.value} type="button" aria-pressed={settings.dock === d.value} onClick={() => update({ dock: d.value })}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="tp-bar-toggle" aria-pressed={settings.mirror} onClick={() => update({ mirror: !settings.mirror })}>
            Espejo
          </button>
          {document.fullscreenEnabled && (
            <button type="button" className="tp-bar-plain" aria-label={full ? 'Salir de pantalla completa' : 'Pantalla completa'} title={full ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={toggleFull}>
              {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          <button type="button" className="tp-bar-plain" aria-label="Cerrar" title="Cerrar" onClick={close}>
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
