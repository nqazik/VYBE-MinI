import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'glass' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-lg shadow-[color:var(--glow-a)] enabled:hover:brightness-110 enabled:active:scale-[0.98]',
  glass: 'glass text-ink enabled:hover:bg-surface-2 enabled:active:scale-[0.98]',
  ghost: 'text-muted enabled:hover:text-ink enabled:hover:bg-surface',
  danger: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30 enabled:hover:bg-rose-500/25',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  busy?: boolean
  icon?: ReactNode
  size?: 'md' | 'lg'
}

export function Button({ variant = 'primary', busy, icon, size = 'md', className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'lg' ? 'px-6 py-3.5 text-base' : 'px-4 py-2.5 text-sm'
      } ${VARIANTS[variant]} ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition enabled:hover:bg-surface-2 enabled:active:scale-95 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`glass rounded-3xl ${className}`}>{children}</div>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-muted" role="status">
      <Loader2 className="h-8 w-8 animate-spin text-brand-a" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const big = size === 'lg'
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className={`grid place-items-center rounded-2xl bg-brand shadow-lg shadow-[color:var(--glow-a)] ${big ? 'h-12 w-12' : 'h-9 w-9'}`}
      >
        <svg viewBox="0 0 24 24" className={big ? 'h-6 w-6' : 'h-4.5 w-4.5'} fill="white" aria-hidden>
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
        </svg>
      </div>
      <span className={`font-extrabold tracking-tight ${big ? 'text-3xl' : 'text-xl'}`}>
        vybe<span className="text-gradient"> mini</span>
      </span>
    </div>
  )
}

/** Soft floating colour glows behind every screen. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-float absolute -left-[15%] -top-[10%] h-[55vmax] w-[55vmax] rounded-full bg-[color:var(--glow-a)] opacity-60 blur-[110px]" />
      <div className="animate-float-slow absolute -bottom-[20%] -right-[15%] h-[50vmax] w-[50vmax] rounded-full bg-[color:var(--glow-b)] opacity-60 blur-[110px]" />
    </div>
  )
}
