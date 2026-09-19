import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Moon, NotebookPen, Search, Settings2, Shapes, Sparkles, Square, Sun, Timer } from 'lucide-react';
import { useAccount } from '@/data/ApiContext';
import { useBoards, useTimerSync } from '@/data/hooks';
import { useRunningTimer } from '@/features/tiempo/model';
import { clock } from '@/lib/format';
import { useStopTimer } from '@/data/hooks';
import { CommandPalette, openPalette } from './CommandPalette';
import { cx, IconButton, LiveDot } from './ui';
import { toggleTheme, useTheme } from '@/lib/theme';
import { leaveDemo } from '@/data/ApiContext';

export const NAV = [
  { to: '/', label: 'Inicio', short: 'Inicio', icon: Home },
  { to: '/tiempo', label: 'Tiempo', short: 'Tiempo', icon: Timer },
  { to: '/consumo', label: 'Consumo IA', short: 'Consumo IA', icon: Sparkles },
  { to: '/tableros', label: 'Tableros', short: 'Tableros', icon: Shapes },
  { to: '/notas', label: 'Notas', short: 'Notas', icon: NotebookPen },
];

export function Shell() {
  const loc = useLocation();
  useTimerSync();
  const timerShownInPage = loc.pathname === '/' || loc.pathname.startsWith('/tiempo');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="os-shell flex min-h-dvh bg-page">
      <a href="#main-content" className="skip-link">Ir al contenido</a>
      <Sidebar showTimer={!timerShownInPage} />
      <main id="main-content" className="min-w-0 flex-1 pb-[calc(96px+var(--safe-bottom))] md:pb-0">
        <DemoBanner />
        <div className="mobile-tools md:hidden"><Link to="/" className="flex items-center gap-2 font-semibold"><img src="/vena-isotipo.png" alt="" width={25} height={25}/>Vena OS</Link><div className="flex items-center gap-2"><button type="button" onClick={openPalette} className="mobile-search"><Search size={16}/> Buscar</button><Link to="/ajustes" aria-label="Ajustes"><Settings2 size={19}/></Link></div></div>
        <Outlet />
      </main>
      <MobileNav showTimer={!timerShownInPage} />
      <CommandPalette />
    </div>
  );
}

function DemoBanner() {
  const { mode } = useAccount();
  if (mode !== 'demo') return null;
  return (
    <div className="flex items-center justify-center gap-3 border-b border-line bg-plane px-4 py-2 text-center text-[12.5px] text-ink-2 pt-[calc(8px+var(--safe-top))] md:pt-2">
      <span>Modo demo: datos de ejemplo, nada se guarda.</span>
      <button type="button" className="font-semibold text-accent" onClick={leaveDemo}>
        Salir
      </button>
    </div>
  );
}

function Sidebar({ showTimer }: { showTimer: boolean }) {
  const { user } = useAccount();
  const boards = useBoards();
  const recent = (boards.data ?? []).slice(0, 3);
  return (
    <aside className="os-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-[18px] border-r border-line bg-plane px-2.5 pt-3 pb-3.5 md:flex">
      <Link to="/" className="os-brand flex h-9 items-center gap-2.5 rounded-lg px-2 hover:bg-fill">
        <img src="/vena-isotipo.png" alt="" className="h-6 w-6" />
        <span className="flex-1 text-sm font-semibold text-ink">Vena OS</span>
      </Link>
      <nav aria-label="Navegación principal" className="os-primary-nav flex flex-col gap-0.5">
        <button type="button" onClick={openPalette} className="os-search flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-nav hover:bg-fill">
          <Search size={18} className="text-ink-2" />
          <span className="flex-1 text-left">Buscar</span>
          <span className="font-mono text-[11px] text-ink-3">⌘K</span>
        </button>
        {NAV.map((n) => (
          <SideLink key={n.to} to={n.to} icon={<n.icon size={18} strokeWidth={1.75} />}>
            {n.label}
          </SideLink>
        ))}
      </nav>
      {recent.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="sidebar-section-label">Tableros recientes</div>
          {recent.map((b) => (
            <Link key={b.id} to={`/tableros/${b.id}`} className="os-recent-link flex h-[30px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-ink-2 hover:bg-fill">
              <Shapes size={16} className="shrink-0 text-ink-3" />
              <span className="truncate">{b.name}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="flex-1" />
      {showTimer && <SidebarTimer />}
      <div className="flex flex-col gap-0.5">
        <SideLink to="/ajustes" icon={<Settings2 size={18} strokeWidth={1.75} />}>
          Ajustes
        </SideLink>
        <div className="os-profile flex h-9 items-center gap-2.5 pr-0.5 pl-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill-2 text-[10.5px] font-bold text-ink-2">
            {user.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="flex-1 truncate text-[13.5px] font-medium text-nav">{user.name}</span>
          <ThemeButton />
        </div>
      </div>
    </aside>
  );
}

/** Quick light/dark switch (Ajustes also offers "Sistema"). */
export function ThemeButton({ size = 30 }: { size?: number }) {
  const { theme } = useTheme();
  const label = theme === 'dark' ? 'Usar modo claro' : 'Usar modo oscuro';
  return (
    <IconButton label={label} size={size} onClick={toggleTheme}>
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </IconButton>
  );
}

function SideLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cx(
          'os-nav-link flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm',
          isActive ? 'bg-fill-2 font-semibold text-ink [&_svg]:text-ink' : 'font-medium text-nav hover:bg-fill [&_svg]:text-ink-2',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

function SidebarTimer() {
  const { timer } = useRunningTimer();
  const stop = useStopTimer();
  if (!timer) return null;
  return (
    <div className="sidebar-timer flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(var(--shade)/0.04)]">
      <LiveDot />
      <Link to="/tiempo" className="flex flex-col">
        <span className="truncate text-[13px] font-semibold text-ink">{timer.task?.name ?? 'Tarea'}</span>
        <span className="truncate text-xs text-ink-3">{timer.project?.name}</span>
      </Link>
      <div className="flex items-center justify-between">
        <span className="tnum text-xl font-semibold tracking-[-0.01em] text-ink">{clock(timer.seconds)}</span>
        <button
          type="button"
          aria-label="Detener"
          title="Detener"
          onClick={() => stop.mutate(undefined)}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-crit-soft text-crit hover:brightness-[0.97]"
        >
          <Square size={12} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

function MobileNav({ showTimer }: { showTimer: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      {showTimer && <MiniTimer />}
      <nav aria-label="Navegación móvil" className="os-mobile-nav flex border-t border-line bg-page px-2" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              cx('flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px]', isActive ? 'font-semibold text-accent' : 'font-medium text-ink-3')
            }
          >
            <n.icon size={24} strokeWidth={1.75} />
            <span>{n.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function MiniTimer() {
  const { timer } = useRunningTimer();
  const stop = useStopTimer();
  if (!timer) return null;
  return (
    <div className="mx-3 mb-2 flex h-[54px] items-center gap-2.5 rounded-[14px] border border-line bg-overlay pr-2.5 pl-3.5 shadow-[0_8px_24px_rgb(var(--shade)/0.12)]">
      <span className="h-2 w-2 shrink-0 rounded-full bg-good" />
      <Link to="/tiempo" className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] font-semibold text-ink">{timer.task?.name}</span>
        <span className="truncate text-[11.5px] text-ink-3">{timer.project?.name}</span>
      </Link>
      <span className="tnum text-base font-semibold text-ink">{clock(timer.seconds)}</span>
      <button
        type="button"
        aria-label="Detener"
        onClick={() => stop.mutate(undefined)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-crit-soft text-crit"
      >
        <Square size={13} fill="currentColor" />
      </button>
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  const { pathname } = useLocation();
  return (
    <div className={cx('os-page mx-auto flex w-full flex-col', `page--${pathname.split('/')[1] || 'home'}`, className)}>
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, right }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="flex flex-col gap-1">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
      </div>
      {right && <div className="page-actions">{right}</div>}
    </header>
  );
}
