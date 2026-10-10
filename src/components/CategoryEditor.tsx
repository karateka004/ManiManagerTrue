import { useEffect, useState } from 'react'
import { BottomSheet, SheetHeader } from './ui/BottomSheet'
import { SegTrack } from './ui/SegTrack'
import { Check } from 'lucide-react'
import { useStore } from '../store/transactions'
import { CATEGORY_COLORS, type Category, type CategoryKind } from '../store/categories'
import { CategoryIcon, ICON_KEYS, ICON_GROUPS } from './icons/CategoryIcon'
import { useT } from '../lib/i18n'
import { hapticSelect, hapticNotify, hapticTap, confirmAction } from '../lib/telegram'

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

  const handleRemove = async () => {
    if (!editing) return
    if (!(await confirmAction(t('cat.delete_confirm', { name: editing.name })))) return
    hapticNotify('warning')
    removeCategory(editing.id)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} z={60} padBottom={0}>
      <SheetHeader
        title={editing ? t('cat.edit') : t('cat.new')}
        className="px-6"
        trailing={
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="shrink-0 text-sm font-medium text-ink-subtle active:text-ink-muted"
          >
            {t('common.cancel')}
          </button>
        }
      />

      {/* Preview */}
      <div className="flex flex-col items-center gap-2 px-6 pb-2 pt-1">
        <div
          key={icon + color}
          className="pop flex h-16 w-16 items-center justify-center rounded-3xl shadow-soft"
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
        <SegTrack active={kind}>
          {([
            { id: 'expense', label: t('common.expense_one') },
            { id: 'income', label: t('common.income_one') },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => { hapticSelect(); setKind(opt.id) }}
              aria-pressed={kind === opt.id}
              className={`seg-item ${kind === opt.id ? 'seg-on' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </SegTrack>
      </div>

      {/* Color picker */}
      <div className="px-6 pb-3">
        <div className="mb-2 caption text-ink-subtle">{t('cat.color')}</div>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { hapticSelect(); setColor(c) }}
              className={`press flex h-9 w-9 items-center justify-center rounded-full ${color === c ? 'scale-110' : ''}`}
              style={{ background: c, boxShadow: color === c ? `0 0 0 3px rgb(var(--c-surface-raised)), 0 0 0 5px ${c}` : undefined }}
              aria-label={c}
            >
              {color === c && <Check size={16} color="#fff" strokeWidth={3} className="pop" />}
            </button>
          ))}
        </div>
      </div>

      {/* Icon picker */}
      <div className="px-6 pb-3">
        <div className="mb-2 caption text-ink-subtle">{t('cat.icon')}</div>
        {/* Иконок много — раскладываем по темам, иначе получается простыня */}
        <div className="flex flex-col gap-3">
          {ICON_GROUPS.map((group) => (
            <div key={group.titleKey}>
              <div className="mb-1.5 text-[11px] font-semibold text-ink-subtle">{t(group.titleKey)}</div>
              <div className="grid grid-cols-7 gap-2">
                {group.keys.map((key) => {
                  const active = icon === key
                  return (
                    <button
                      key={key}
                      onClick={() => { hapticSelect(); setIcon(key) }}
                      className="press flex aspect-square items-center justify-center rounded-2xl transition-[background-color,box-shadow,color] duration-200"
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
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-1">
        <button
          onClick={save}
          disabled={!canSave}
          className={`press-soft w-full rounded-full bg-brand-500 py-4 text-base font-bold text-white transition-opacity ${
            canSave ? '' : 'opacity-40'
          }`}
        >
          {editing ? t('common.save') : t('cat.create')}
        </button>
        {editing && (
          <button
            onClick={handleRemove}
            className="mt-2 w-full rounded-full py-3 text-sm font-semibold text-expense-deep dark:text-expense-soft active:bg-expense-soft/50"
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
    </BottomSheet>
  )
}
