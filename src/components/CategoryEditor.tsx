import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Check } from 'lucide-react'
import { useStore } from '../store/transactions'
import { CATEGORY_COLORS, type Category, type CategoryKind } from '../store/categories'
import { CategoryIcon, ICON_KEYS } from './icons/CategoryIcon'
import { useT } from '../lib/i18n'
import { hapticSelect, hapticNotify, hapticTap } from '../lib/telegram'

interface Props {
  open: boolean
  /** Если задан — редактируем существующую пользовательскую категорию. */
  editing?: Category | null
  /** Тип по умолчанию для новой категории. */
  defaultKind?: CategoryKind
  onClose: () => void
}

export function CategoryEditor({ open, editing, defaultKind = 'expense', onClose }: Props) {
  const addCategory = useStore((s) => s.addCategory)
  const updateCategory = useStore((s) => s.updateCategory)
  const removeCategory = useStore((s) => s.removeCategory)
  const t = useT()

  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>(defaultKind)
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [icon, setIcon] = useState(ICON_KEYS[0])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setKind(editing.kind)
      setColor(editing.color)
      setIcon(editing.icon)
    } else {
      setName('')
      setKind(defaultKind)
      setColor(CATEGORY_COLORS[0])
      setIcon(ICON_KEYS[0])
    }
  }, [open, editing, defaultKind])

  const canSave = name.trim().length > 0

  const save = () => {
    if (!canSave) return
    hapticNotify('success')
    const payload = { name: name.trim(), kind, color, icon }
    if (editing) updateCategory(editing.id, payload)
    else addCategory(payload)
    onClose()
  }

  const handleRemove = () => {
    if (!editing) return
    if (!confirm(t('cat.delete_confirm', { name: editing.name }))) return
    hapticNotify('warning')
    removeCategory(editing.id)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[94vh] overflow-y-auto rounded-t-5xl bg-surface-raised shadow-raised"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>

            <div className="flex items-center justify-between px-6 py-2">
              <span className="text-base font-bold text-ink">
                {editing ? t('cat.edit') : t('cat.new')}
              </span>
              <button onClick={onClose} className="text-sm font-medium text-ink-subtle active:text-ink-muted">
                {t('common.cancel')}
              </button>
            </div>

            {/* Preview */}
            <div className="flex flex-col items-center gap-2 px-6 pb-2 pt-1">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-3xl shadow-soft"
                style={{ background: color + '22', color }}
              >
                <CategoryIcon id={icon} size={32} />
              </div>
              <span className="text-sm font-semibold text-ink">{name.trim() || t('cat.untitled')}</span>
            </div>

            {/* Name */}
            <div className="px-6 pb-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('cat.name_ph')}
                maxLength={24}
                className="w-full rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            {/* Kind */}
            <div className="px-6 pb-3">
              <div className="flex gap-1 rounded-full bg-surface-sunken p-1">
                {([
                  { id: 'expense', label: t('common.expense_one') },
                  { id: 'income', label: t('common.income_one') },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => { hapticSelect(); setKind(opt.id) }}
                    className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
                      kind === opt.id ? 'bg-surface-raised text-ink shadow-soft dark:shadow-soft-dark' : 'text-ink-subtle'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div className="px-6 pb-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('cat.color')}</div>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { hapticSelect(); setColor(c) }}
                    className="flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-90"
                    style={{ background: c }}
                    aria-label={c}
                  >
                    {color === c && <Check size={16} color="#fff" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon picker */}
            <div className="px-6 pb-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('cat.icon')}</div>
              <div className="grid grid-cols-7 gap-2">
                {ICON_KEYS.map((key) => {
                  const active = icon === key
                  return (
                    <button
                      key={key}
                      onClick={() => { hapticSelect(); setIcon(key) }}
                      className="flex aspect-square items-center justify-center rounded-2xl transition-all active:scale-90"
                      style={{
                        background: active ? color + '22' : 'rgb(var(--c-surface-sunken))',
                        color: active ? color : undefined,
                        boxShadow: active ? `inset 0 0 0 2px ${color}` : undefined,
                      }}
                    >
                      <CategoryIcon id={key} size={20} />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 pt-1">
              <button
                onClick={save}
                disabled={!canSave}
                className={`w-full rounded-full bg-brand-500 py-4 text-base font-bold text-white shadow-fab transition-transform active:scale-[0.98] ${
                  canSave ? '' : 'opacity-40'
                }`}
              >
                {editing ? t('common.save') : t('cat.create')}
              </button>
              {editing && (
                <button
                  onClick={handleRemove}
                  className="mt-2 w-full rounded-full py-3 text-sm font-semibold text-expense-deep active:bg-expense-soft/50"
                >
                  {t('cat.delete')}
                </button>
              )}
              {!editing && (
                <button
                  onClick={() => { hapticTap(); onClose() }}
                  className="mt-2 w-full py-2 text-center text-xs text-ink-subtle"
                >
                  {t('common.close')}
                </button>
              )}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
