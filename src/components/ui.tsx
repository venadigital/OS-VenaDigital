// Small UI kit matching the design: warm grays, one accent, hairline borders.
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { MoreHorizontal, X } from 'lucide-react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'bg-white text-ink border border-line-2 hover:bg-plane',
  ghost: 'text-ink-2 hover:bg-fill',
  danger: 'bg-crit-soft text-crit hover:brightness-[0.97]',
  subtle: 'bg-fill text-ink-2 hover:bg-fill-2',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-[34px] px-3.5 text-[13.5px] gap-1.5 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-full',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; pill?: boolean }
>(function Button({ variant = 'secondary', size = 'md', icon, pill, className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary' && 'font-semibold',
        VARIANTS[variant],
        SIZES[size],
        pill && 'rounded-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  className,
  size = 34,
  variant = 'ghost',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number; variant?: 'ghost' | 'bordered' | 'round' | 'accent' | 'danger' }) {
  const styles = {
    ghost: 'rounded-lg text-ink-2 hover:bg-fill',
    bordered: 'rounded-lg border border-line-2 bg-white text-ink-2 hover:bg-plane',
    round: 'rounded-full bg-fill-2 text-ink-2 hover:brightness-95',
    accent: 'rounded-full bg-accent text-white hover:bg-accent-strong',
    danger: 'rounded-full bg-crit-soft text-crit hover:brightness-[0.97]',
  }[variant];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex shrink-0 items-center justify-center transition-colors disabled:opacity-40', styles, className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, as: Tag = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' }) {
  return <Tag className={cx('flex flex-col gap-4 rounded-[14px] border border-line bg-white p-5', className)}>{children}</Tag>;
}

export function CardHead({ title, right, className }: { title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-h-[22px] items-center justify-between gap-3', className)}>
      <h2 className="text-[15px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
      {right}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-medium text-ink-2">{children}</div>;
}

export function Dot({ color, size = 8, className }: { color: string; size?: number; className?: string }) {
  return <span className={cx('inline-block shrink-0 rounded-full', className)} style={{ width: size, height: size, background: color }} />;
}

export function LiveDot({ label = 'En curso' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
      <span className="relative inline-flex h-[7px] w-[7px]">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-40" />
        <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-good" />
      </span>
      {label}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-[22px] items-center rounded-md bg-accent-soft px-2 text-[12.5px] font-semibold text-accent', className)}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  full,
  size = 'md',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <div role="tablist" className={cx('flex items-center gap-0.5 rounded-[9px] bg-fill p-0.5', full && 'w-full')}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex items-center justify-center rounded-[7px] px-3.5 text-[13px] transition-colors',
              size === 'lg' ? 'h-10' : 'h-[26px]',
              full && 'flex-1',
              on ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(31,30,28,0.10),0_0_0_0.5px_rgba(31,30,28,0.08)]' : 'font-medium text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const fieldBase =
  'w-full rounded-[10px] border border-line-2 bg-white px-3 text-[14px] text-ink placeholder:text-ink-4 outline-none transition-shadow focus:border-accent focus:ring-4 focus:ring-accent-soft';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(fieldBase, 'min-h-24 py-2.5 leading-5', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, 'h-10 appearance-none bg-[length:14px] bg-[right_10px_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      {children}
    </select>
  );
}
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23898781' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

/** Modal built on the native <dialog>. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_64px_rgba(31,30,28,0.18)]"
      style={{ maxWidth: width }}
    >
      {open && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
            <h2 className="text-[16px] font-semibold">{title}</h2>
            <IconButton label="Cerrar" onClick={onClose} size={30}>
              <X size={16} />
            </IconButton>
          </div>
          <div className="flex flex-col gap-4 px-5 pt-2 pb-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode };

/** "…" button with a small popover of actions. */
export function Menu({ items, label = 'Más opciones', align = 'right', trigger }: { items: MenuItem[]; label?: string; align?: 'left' | 'right'; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {trigger ? (
        <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      ) : (
        <IconButton label={label} size={30} onClick={() => setOpen((o) => !o)}>
          <MoreHorizontal size={18} />
        </IconButton>
      )}
      {open && (
        <div
          role="menu"
          className={cx(
            'absolute top-full z-30 mt-1 min-w-44 rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_rgba(31,30,28,0.14)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-fill',
                it.danger ? 'text-crit' : 'text-ink',
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-2 px-6 py-10 text-center">
      {icon && <div className="text-ink-4">{icon}</div>}
      <div className="text-[14.5px] font-semibold text-ink">{title}</div>
      {children && <div className="max-w-sm text-[13px] leading-5 text-ink-3">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-fill', className)} />;
}

export function ColorSwatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={cx('h-7 w-7 rounded-full ring-offset-2 transition-shadow', value === c && 'ring-2 ring-ink')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
