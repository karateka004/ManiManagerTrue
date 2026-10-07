import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Settings, Target, Check, ScrollText } from 'lucide-react'
import { useStore, selectAllCategories, getCategory } from '../store/transactions'
import { formatMoney, dayjs } from '../lib/format'
import { Avatar } from '../components/Avatar'
import { openTelegramLink, hapticTap, hapticNotify } from '../lib/telegram'
import { tg } from '../lib/telegram'
import { sendFeedback, isBackendConfigured, BOT_USERNAME } from '../lib/api'
import { useLevel } from '../components/LevelBar'
import { LEVELS } from '../lib/levels'
import { getReward } from '../lib/rewards'
import { useCatName, useT, type TFunc } from '../lib/i18n'
import type { Currency } from '../lib/currencies'
import { Group, Row } from '../components/ui/Group'
import { RewardBadge } from '../components/rewards/RewardBadge'

import { APP_VERSION, VERSION_KEY, newReleasesSince } from '../lib/whatsnew'

// Планирование (финансы) — ленивая шторка, грузится по первому открытию.
const PlanningSheet = lazy(() => import('../components/PlanningSheet').then((m) => ({ default: m.PlanningSheet })))
// История обновлений — тоже лениво, открывается из строки «Обновления».
const ChangelogSheet = lazy(() => import('../components/ChangelogSheet').then((m) => ({ default: m.ChangelogSheet })))

/** Версия, до которой пользователь уже видел изменения (из localStorage). */
function readSeenVersion(): string {
  try {
    return localStorage.getItem(VERSION_KEY) ?? '0.0.0'
  } catch {
    return APP_VERSION
  }
}

/** Запасной чат, если бэкенд не настроен. */
const FEEDBACK_FALLBACK_URL = `https://t.me/${BOT_USERNAME}`

interface Props {
  onOpenSettings: () => void
  onOpenRewards: () => void
}

/** Итоги по одной валюте. */
interface CurrencyTotals {
  currency: Currency
  income: number
  expense: number
}

/**
 * Вкладка «Профиль»: кто ты, выписка за всё время, уровень, планирование, отзыв.
 *
 * 2.0: четыре карточки-счётчика стали одной выпиской, меню — строками одной
 * группы без цветных квадратов. И исправлена ошибка: доходы и расходы
 * складывались в одно число из всех валют и подписывались валютой по умолчанию
 * — 100 $ и 4000 ₴ показывались как «4100 ₴». Курсов в приложении нет, поэтому
 * разные валюты не складываем, а показываем каждую своей строкой.
 */
export function ProfilePage({ onOpenSettings, onOpenRewards }: Props) {
  const t = useT()
  const catName = useCatName()
  const transactions = useStore((s) => s.transactions)
  const cats = useStore(selectAllCategories)
  const currency = useStore((s) => s.currency)
  const track = useStore((s) => s.track)
  const equippedTitleId = useStore((s) => s.equipped.title)
  const user = tg.user
  const lvl = useLevel()
  const eqTitleReward = getReward(equippedTitleId)
  const equippedTitle = eqTitleReward ? t('reward.' + eqTitleReward.id + '.name') : undefined

  const [planningOpen, setPlanningOpen] = useState(false)
  const seenPlanning = useRef(false)
  if (planningOpen) seenPlanning.current = true

  const openPlanning = () => {
    track('open_planning')
    setPlanningOpen(true)
  }

  // История обновлений: версия, до которой человек уже всё видел, и счётчик новых.
  const [seenVersion, setSeenVersion] = useState(readSeenVersion)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const seenChangelog = useRef(false)
  if (changelogOpen) seenChangelog.current = true
  const unseenCount = useMemo(() => newReleasesSince(seenVersion).length, [seenVersion])

  const closeChangelog = () => {
    // Открыл раздел — значит изменения просмотрены, счётчик гаснет.
    try {
      localStorage.setItem(VERSION_KEY, APP_VERSION)
    } catch {
      /* приватный режим — переживём, счётчик просто появится снова */
    }
    setSeenVersion(APP_VERSION)
    setChangelogOpen(false)
  }

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('profile.guest')
  const username = user?.username

  const stats = useMemo(() => {
    const byCur = new Map<Currency, CurrencyTotals & { ops: number }>()
    const byCat = new Map<string, number>() // ключ — `${валюта}|${категория}`
    let firstDate: string | null = null
    for (const tx of transactions) {
      const cur = tx.currency ?? currency
      let row = byCur.get(cur)
      if (!row) {
        row = { currency: cur, income: 0, expense: 0, ops: 0 }
        byCur.set(cur, row)
      }
      row.ops++
      if (tx.type === 'income') row.income += tx.amount
      else {
        row.expense += tx.amount
        const key = cur + '|' + tx.categoryId
        byCat.set(key, (byCat.get(key) ?? 0) + tx.amount)
      }
      if (!firstDate || tx.date < firstDate) firstDate = tx.date
    }
    // Порядок валют — по числу операций: основная валюта человека идёт первой.
    const totals = [...byCur.values()].sort((a, b) => b.ops - a.ops)
    if (totals.length === 0) totals.push({ currency, income: 0, expense: 0, ops: 0 })

    // Главная статья расходов — в основной валюте: сравнивать суммы в гривнах и
    // долларах между собой без курса нельзя.
    const main = totals[0].currency
    let topCat: { id: string; name: string; amount: number; currency: Currency } | null = null
    for (const [key, amount] of byCat) {
      const sep = key.indexOf('|')
      if (key.slice(0, sep) !== main) continue
      if (!topCat || amount > topCat.amount) {
        const id = key.slice(sep + 1)
        topCat = { id, name: getCategory(id, cats).name, amount, currency: main }
      }
    }
    return { totals, count: transactions.length, topCat, firstDate }
  }, [transactions, cats, currency])

  return (
    <div className="pb-28">
      {/* Шапка с шестерёнкой настроек */}
      <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-6">
        <div>
          <div className="kicker">{t('profile.kicker')}</div>
          <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('profile.title')}</div>
        </div>
        <button
          onClick={() => { hapticTap(); onOpenSettings() }}
          aria-label={t('nav.settings')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted shadow-soft transition-transform active:scale-95"
        >
          <Settings size={18} strokeWidth={2.2} />
        </button>
      </div>

      {/* Кто ты — одной строкой, без карточки: это подпись к экрану, а не блок данных. */}
      <div className="mt-3 flex items-center gap-3.5 px-5">
        <Avatar size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold leading-tight text-ink">{name}</div>
          <div className="caption mt-1 flex min-w-0 items-center gap-1.5 text-ink-subtle">
            {username && <span className="truncate">@{username}</span>}
            {username && equippedTitle && <span aria-hidden>·</span>}
            {equippedTitle && <span className="truncate text-ink-muted">{equippedTitle}</span>}
            {!username && !equippedTitle && !tg.isInTelegram && <span>{t('profile.open_in_tg')}</span>}
          </div>
        </div>
      </div>

      {/* Выписка за всё время. Каждая валюта — своей строкой значения. */}
      <Group className="mx-4 mt-5" title={t('profile.all_time')}>
        <Row
          title={t('common.income')}
          value={<PerCurrency totals={stats.totals} pick={(r) => r.income} sign="+" />}
        />
        <Row
          title={t('common.expense')}
          value={<PerCurrency totals={stats.totals} pick={(r) => r.expense} sign="−" />}
        />
        <Row
          title={t('profile.balance')}
          value={<PerCurrency totals={stats.totals} pick={(r) => r.income - r.expense} signed />}
        />
        <Row title={t('profile.ops')} value={stats.count.toLocaleString('ru-RU')} />
        {stats.topCat && (
          <Row
            title={t('profile.top_short')}
            value={catName(stats.topCat.id, stats.topCat.name)}
            valueSub={formatMoney(stats.topCat.amount, stats.topCat.currency)}
          />
        )}
        {stats.firstDate && (
          <Row title={t('profile.first_entry')} value={dayjs(stats.firstDate).format('D MMMM YYYY')} />
        )}
      </Group>

      <Group className="mx-4 mt-6">
        {/* Уровень — строкой с полосой; подробности и награды на «Прогрессе». */}
        <Row
          lead={
            <span className="mr-3 shrink-0">
              <RewardBadge level={lvl.level} size={28} />
            </span>
          }
          title={t('level.t' + lvl.level)}
          subtitle={t('profile.level', { level: lvl.level, max: LEVELS.length })}
          value={<span className="text-ink-muted">{lvl.xp.toLocaleString('ru-RU')} XP</span>}
          chevron
          onClick={() => { hapticTap(); onOpenRewards() }}
        >
          <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="block h-full rounded-full bg-brand-500 transition-[width] duration-500"
              style={{ width: `${Math.round(lvl.ratio * 100)}%` }}
            />
          </span>
        </Row>
        <Row
          icon={<Target size={18} strokeWidth={2} />}
          title={t('profile.planning')}
          chevron
          onClick={openPlanning}
        />
        {/* История обновлений — вместо всплывающей шторки при запуске */}
        <Row
          icon={<ScrollText size={18} strokeWidth={2} />}
          title={t('changelog.title')}
          value={
            unseenCount > 0 ? (
              <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[12px] font-bold text-white">
                {unseenCount}
              </span>
            ) : (
              <span className="text-ink-subtle">v{APP_VERSION}</span>
            )
          }
          chevron
          onClick={() => setChangelogOpen(true)}
        />
      </Group>

      {/* Отзыв */}
      <FeedbackBlock t={t} />

      <Suspense fallback={null}>
        {seenPlanning.current && <PlanningSheet open={planningOpen} onClose={() => setPlanningOpen(false)} />}
      </Suspense>

      <Suspense fallback={null}>
        {seenChangelog.current && (
          <ChangelogSheet open={changelogOpen} onClose={closeChangelog} seenVersion={seenVersion} />
        )}
      </Suspense>
    </div>
  )
}

/**
 * Значение по валютам столбиком: «+111 370 ₴» и под ним «+500 €». Одно число на
 * все валюты было бы неправдой, а первая строка — основная валюта.
 */
function PerCurrency({
  totals,
  pick,
  sign,
  signed,
}: {
  totals: CurrencyTotals[]
  pick: (r: CurrencyTotals) => number
  /** Постоянный знак (у доходов «+», у расходов «−»), если сумма не ноль. */
  sign?: '+' | '−'
  /** Знак по самому числу — для баланса. */
  signed?: boolean
}) {
  return (
    <>
      {totals.map((r) => {
        const v = pick(r)
        const text = signed
          ? formatMoney(v, r.currency, { sign: true })
          : (v !== 0 && sign ? sign : '') + formatMoney(v, r.currency)
        return (
          <span key={r.currency} className={`block ${signed && v < 0 ? 'text-expense-deep dark:text-expense-soft' : ''}`}>
            {text}
          </span>
        )
      })}
    </>
  )
}

/* ---------- Блок отзыва ---------- */

type SendState = 'idle' | 'sending' | 'sent' | 'error'

function FeedbackBlock({ t }: { t: TFunc }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<SendState>('idle')

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || state === 'sending') return
    hapticTap()

    if (!isBackendConfigured()) {
      openTelegramLink(FEEDBACK_FALLBACK_URL)
      return
    }

    setState('sending')
    try {
      const r = await sendFeedback(trimmed)
      if (r.ok) {
        setState('sent')
        setText('')
        hapticNotify('success')
      } else {
        setState('error')
        hapticNotify('error')
      }
    } catch {
      setState('error')
      hapticNotify('error')
    }
  }

  return (
    <Group className="mx-4 mt-6" title={t('profile.feedback')}>
      <div className="p-3">
        {state === 'sent' ? (
          <div className="flex items-center gap-2 px-1 py-2 text-[15px] font-medium text-income-deep dark:text-brand-300">
            <Check size={18} strokeWidth={2.5} />
            {t('profile.feedback_thanks')}
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); if (state === 'error') setState('idle') }}
              rows={3}
              maxLength={1000}
              placeholder={t('profile.feedback_placeholder')}
              className="w-full resize-none rounded-2xl bg-surface-sunken px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            {state === 'error' && (
              <div className="caption-sm mt-1 px-1 text-expense-deep dark:text-expense-soft">{t('profile.feedback_error')}</div>
            )}
            <button
              onClick={submit}
              disabled={!text.trim() || state === 'sending'}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-[15px] font-bold text-white transition active:scale-[0.99] disabled:opacity-40"
            >
              {state === 'sending' ? t('profile.feedback_sending') : isBackendConfigured() ? t('profile.feedback_send') : t('profile.feedback_chat')}
            </button>
          </>
        )}
      </div>
    </Group>
  )
}
