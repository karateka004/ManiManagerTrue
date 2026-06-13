/**
 * Акцентные «чипы» и подсветка для плиток/строк (единый словарь, чтобы не
 * дублировать tailwind-классы по компонентам). Светлая + тёмная тема.
 */
export type Accent = 'brand' | 'amber' | 'yellow' | 'emerald' | 'rose' | 'violet'

export const ACCENT_CHIP: Record<Accent, string> = {
  brand: 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  rose: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  violet: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
}

/** Мягкая «атмосферная» подсветка в углу плитки (блюр-кружок). */
export const ACCENT_GLOW: Record<Accent, string> = {
  brand: 'bg-brand-400/25',
  amber: 'bg-amber-400/30',
  yellow: 'bg-yellow-400/30',
  emerald: 'bg-emerald-400/25',
  rose: 'bg-rose-400/25',
  violet: 'bg-violet-400/25',
}
