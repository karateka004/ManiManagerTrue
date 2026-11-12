import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../../store/transactions'
import { detectCurrency } from '../../lib/currencyDetect'
import { reportQuickStart, setReminders } from '../../lib/api'
import { QS_KEY, TOUR_DONE_KEY } from '../../lib/introKeys'
import type { TourReason } from '../Intro'
import { CURRENCY_ASKED_KEY } from '../../lib/currencyAsked'
import { botCanWrite, canRequestBotWrite, hapticNotify, hapticSelect, hapticTap, requestBotWrite, tg } from '../../lib/telegram'
import { UNMASK, clarityEvent, clarityKeep, clarityTag } from '../../lib/clarity'

/**
 * Обучение новичка (2.9) вместо анкеты быстрого старта: как в играх — экран
 * затемнён, подсвечено одно место, и человек сам делает действие в настоящем
 * интерфейсе: «+» → сумма → категория → «Записать» → баланс → Аналитика.
 * Первая трата записывается по-настоящему, а куда нажимать, он уже знает.
 *
 * Как устроено. Цели помечены в разметке `data-tour="…"` (TabBar, BalanceCard,
 * AddTransactionSheet). Каждый кадр, пока идёт обучение, читаем их рамки и
 * двигаем вырезы затемнения (SVG-маска) и кольцо — шторка выезжает, и
 * подсветка едет вместе с ней. Шаг засчитываем по самому интерфейсу: шторка
 * открылась, сумма набрана (`data-value`), категория выбрана, операция в
 * сторе, вкладка открыта. Нажатия мимо подсветки гасим на document в фазе
 * перехвата; шторки поверх шторки операции (валюта, новая категория) —
 * свободны. Слой — z 55: над шторкой операции (51), под вложенными (60).
 *
 * Шаги в админку (/qs, `v: 2`): 0 предложили, 1 начали, 2 открыли запись,
 * 3 записали первую трату, 4 дошли до конца. Только у новичков: повторное
 * предложение (заходит, а записей нет) и обучение по ссылке воронку не трогают.
 * Прошёл до конца — `TOUR_DONE_KEY`, повторно больше не предлагаем. Закрыл приложение посреди —
 * продолжает с того же места (QS_KEY, как у прежнего быстрого старта).
 */

type Step = 'offer' | 'plus' | 'amount' | 'category' | 'save' | 'balance' | 'analytics' | 'done'
const ORDER: Step[] = ['offer', 'plus', 'amount', 'category', 'save', 'balance', 'analytics', 'done']
/** Номер шага для админки — как QS_STEPS воркера. */
const REPORT: Record<Step, number> = { offer: 0, plus: 1, amount: 2, category: 2, save: 2, balance: 3, analytics: 3, done: 4 }
/** Шаги внутри шторки операции: шторку закрыли — снова к «+». */
const IN_SHEET: Step[] = ['amount', 'category', 'save']

/** Что подсвечено (первое — кольцо) и куда можно нажимать. */
const TARGETS: Partial<Record<Step, { lit: string[]; tap: boolean }>> = {
  plus: { lit: ['plus'], tap: true },
  amount: { lit: ['keypad', 'amount'], tap: true },
  category: { lit: ['categories'], tap: true },
  save: { lit: ['save'], tap: true },
  balance: { lit: ['balance'], tap: false },
  analytics: { lit: ['tab-analytics'], tap: true },
}

type Lang = 'ru' | 'en'
const TEXT = {
  ru: {
    offerTitle: 'Привет! Я «Кошель»',
    offerText: 'Покажу за полминуты, как тут всё устроено: ты сам запишешь первую трату, а я подскажу, куда нажимать.',
    againTitle: 'Показать, как тут всё устроено?',
    againText: 'Полминуты: ты запишешь трату, а я подскажу, куда нажимать. С первой записи вести учёт становится проще.',
    start: 'Пройти обучение',
    decline: 'Разберусь сам',
    plus: 'Нажми «+» — так записывается любая трата или доход.',
    amount: 'Набери сумму — например, сколько сегодня ушло на еду. Валюта — под суммой, её можно сменить.',
    amountReady: 'Готово',
    category: 'Теперь выбери категорию — на что ушли деньги.',
    save: 'Осталось нажать «Записать расход».',
    balance: 'Вот она: баланс за месяц уже с твоей тратой. Нажатие на карточку тоже открывает запись.',
    next: 'Дальше',
    analytics: 'А здесь видно, куда уходят деньги — по категориям и по дням. Загляни.',
    doneTitle: 'Ты в деле',
    doneText: 'Записывай траты, как только они случились, — так картина будет честной. Можно и сообщением боту: «Ушло 300 на кофе».',
    remindText: 'Напомню вечером, если за день не было ни одной записи.',
    remindOn: 'Напоминать вечером',
    remindOff: 'Не нужно',
    finish: 'Начать',
    skip: 'Пропустить обучение',
    step: (n: number, of: number) => `Шаг ${n} из ${of}`,
  },
  en: {
    offerTitle: 'Hey! I’m Koshel',
    offerText: 'Let me show you around in half a minute: you’ll log your first expense yourself, and I’ll point to where to tap.',
    againTitle: 'Want a quick tour?',
    againText: 'Half a minute: you’ll log an expense, and I’ll point to where to tap. Tracking gets easier after the first entry.',
    start: 'Take the tour',
    decline: 'I’ll figure it out',
    plus: 'Tap “+” — that’s how you log any expense or income.',
    amount: 'Type an amount — say, what you spent on food today. The currency is under the amount; you can change it.',
    amountReady: 'Done',
    category: 'Now pick a category — what was the money for?',
    save: 'Now tap “Save expense”.',
    balance: 'There it is: your monthly balance, already with your expense. Tapping the card opens a new entry too.',
    next: 'Next',
    analytics: 'And here you can see where the money goes — by category and by day. Take a look.',
    doneTitle: 'You’re all set',
    doneText: 'Log expenses as they happen — that keeps the picture honest. You can also just message the bot: “Spent 300 on coffee”.',
    remindText: 'I’ll remind you in the evening if a day has no entries.',
    remindOn: 'Remind me in the evening',
    remindOff: 'No thanks',
    finish: 'Let’s go',
    skip: 'Skip the tour',
    step: (n: number, of: number) => `Step ${n} of ${of}`,
  },
} as const

/** Место в QS_KEY: шаг (номер в ORDER) и id записанной в обучении траты. */
interface Saved {
  v: 2
  s: number
  ids: string[]
}
function readSaved(): { step: Step; id: string | null } {
  try {
    const v = JSON.parse(localStorage.getItem(QS_KEY) ?? 'null') as Partial<Saved> | null
    // Незаконченный быстрый старт прошлой версии — начинаем обучение сначала.
    if (!v || v.v !== 2 || typeof v.s !== 'number') return { step: 'offer', id: null }
    const have = new Set(useStore.getState().transactions.map((x) => x.id))
    const id = Array.isArray(v.ids) && typeof v.ids[0] === 'string' && have.has(v.ids[0]) ? v.ids[0] : null
    let step = ORDER[Math.max(0, Math.min(ORDER.length - 1, Math.floor(v.s)))]
    // Шторка после перезапуска закрыта — с «+»; трата уже есть — к балансу.
    if (IN_SHEET.includes(step)) step = 'plus'
    if (id && ORDER.indexOf(step) < ORDER.indexOf('balance')) step = 'balance'
    if (!id && ORDER.indexOf(step) >= ORDER.indexOf('balance')) step = 'plus'
    return { step, id }
  } catch {
    return { step: 'offer', id: null }
  }
}
function writeSaved(step: Step, id: string | null) {
  try {
    localStorage.setItem(QS_KEY, JSON.stringify({ v: 2, s: ORDER.indexOf(step), ids: id ? [id] : [] } satisfies Saved))
  } catch {
    /* приватный режим — продолжить с места не выйдет */
  }
}
function clearSaved() {
  try {
    localStorage.removeItem(QS_KEY)
  } catch {
    /* нечего чистить */
  }
}

const el = (name: string) => document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
/** Рамка цели, если она на экране. */
function rectOf(name: string): DOMRect | null {
  const e = el(name)
  if (!e) return null
  const r = e.getBoundingClientRect()
  if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight) return null
  return r
}
/** Шторка операции открыта и выехала: видна кнопка «Записать». */
const sheetOpen = () => {
  const r = rectOf('save')
  return !!r && r.bottom <= innerHeight + 4
}

const PAD = 6
const MAX_HOLES = 2

export function Tour({ onDone, reason = 'new' }: { onDone: () => void; reason?: TourReason }) {
  // Воронка в админке — только про новичков.
  const report = reason === 'new' ? reportQuickStart : () => {}
  const lang: Lang = useStore((s) => s.lang) === 'en' ? 'en' : 'ru'
  const tx = TEXT[lang]
  const [saved] = useState(readSaved)
  const [step, setStep] = useState<Step>(saved.step)
  const [recorded, setRecorded] = useState<string | null>(saved.id)
  const [hasAmount, setHasAmount] = useState(false)
  const stepRef = useRef(step)
  stepRef.current = step

  const go = (next: Step) => {
    if (stepRef.current === next) return
    stepRef.current = next
    hapticSelect()
    setStep(next)
  }

  // Каждую такую сессию держим в записях Clarity и метим шаги.
  useEffect(() => {
    clarityTag('onboarding', reason === 'new' ? 'tour' : 'tour_' + reason)
    clarityKeep('onboarding')
  }, [])
  useEffect(() => clarityEvent('onboarding_' + step), [step])
  // Место — в localStorage (не в стор: сохранённый стор значит «старый
  // пользователь»); с предложения не пишем — его и так покажем.
  useEffect(() => {
    if (step !== 'offer') writeSaved(step, recorded)
  }, [step, recorded])
  const reported = useRef(-1)
  useEffect(() => {
    const s = REPORT[step]
    if (s === reported.current) return
    reported.current = s
    report({ s, e: recorded ? 1 : 0, i: false, v: 2 })
  }, [step, recorded])
  // Пока идёт обучение, пустое место шторки клавиатуру не сворачивает.
  useEffect(() => {
    document.body.setAttribute('data-touring', '')
    return () => document.body.removeAttribute('data-touring')
  }, [])

  // Валюта по региону — при ответе на предложение, НЕ при открытии: запись в
  // стор при открытии сохранила бы его, и ушедший с первого экрана в следующий
  // раз считался бы старым пользователем.
  const applyRegion = () => {
    const s = useStore.getState()
    const d = detectCurrency()
    if (s.transactions.length === 0 && s.currency === 'USD' && d.currency !== 'USD') s.setCurrency(d.currency)
    try {
      localStorage.setItem(CURRENCY_ASKED_KEY, '1')
    } catch {
      /* приватный режим */
    }
  }

  const exit = () => {
    const s = REPORT[stepRef.current]
    clarityEvent('onboarding_exit')
    clarityTag('onboarding_exit_at', stepRef.current)
    report({ s, e: recorded ? 1 : 0, i: false, x: s, v: 2 })
    applyRegion()
    clearSaved()
    onDone()
  }
  const start = () => {
    hapticTap()
    applyRegion()
    go('plus')
  }

  // Напоминания: разрешение боту писать — в конце, когда человек уже понял,
  // зачем. Без разрешения бот не напишет ни разу.
  const reminders = useStore((s) => s.remindersEnabled)
  const [askRemind] = useState(() => tg.isInTelegram && !botCanWrite() && canRequestBotWrite())
  const busy = useRef(false)
  const finish = async (remind: boolean) => {
    if (busy.current) return
    busy.current = true
    if (askRemind) {
      if (remind) {
        const granted = await Promise.race([requestBotWrite(), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))])
        clarityEvent(granted ? 'bot_write_yes' : 'bot_write_no')
        if (granted) void setReminders(true)
        else useStore.getState().setRemindersEnabled(false)
      } else {
        useStore.getState().setRemindersEnabled(false)
      }
    }
    hapticNotify('success')
    clarityEvent('onboarding_done')
    report({ s: REPORT.done, e: recorded ? 1 : 0, i: false, d: true, v: 2 })
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1')
    } catch {
      /* приватный режим */
    }
    clearSaved()
    onDone()
  }

  // Трата из шторки: новая операция в сторе — шаг пройден.
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (step !== 'save') {
      known.current = null
      return
    }
    known.current = new Set(useStore.getState().transactions.map((x) => x.id))
    return useStore.subscribe((s) => {
      const fresh = s.transactions.find((x) => !known.current?.has(x.id))
      if (fresh) {
        setRecorded(fresh.id)
        go('balance')
      }
    })
  }, [step])

  // Каждый кадр: рамки целей → вырезы, кольцо и карточка; заодно — проверка шага.
  const maskRefs = useRef<(SVGRectElement | null)[]>([])
  const ringRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const gone = useRef(0)
  useLayoutEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const cur = stepRef.current
      // Шаг по самому интерфейсу.
      if (cur === 'plus' && sheetOpen()) go('amount')
      else if (IN_SHEET.includes(cur)) {
        if (!rectOf('save')) {
          // Шторку закрыли (свайпом, «Назад») — снова к «+».
          if (!gone.current) gone.current = performance.now()
          else if (performance.now() - gone.current > 600) {
            gone.current = 0
            go('plus')
          }
        } else gone.current = 0
        const amount = Number(el('amount')?.dataset.value ?? 0)
        setHasAmount(amount > 0)
        if (cur === 'category' && el('categories')?.dataset.value) go('save')
      } else if (cur === 'analytics' && el('tab-analytics')?.getAttribute('aria-current') === 'page') go('done')

      const t = TARGETS[cur]
      const rects = (t?.lit ?? []).map(rectOf)
      for (let i = 0; i < MAX_HOLES; i++) {
        const node = maskRefs.current[i]
        const r = rects[i]
        if (!node) continue
        if (!r) {
          node.setAttribute('width', '0')
          continue
        }
        node.setAttribute('x', String(r.left - PAD))
        node.setAttribute('y', String(r.top - PAD))
        node.setAttribute('width', String(r.width + PAD * 2))
        node.setAttribute('height', String(r.height + PAD * 2))
      }
      const main = rects[0]
      const ring = ringRef.current
      if (ring) {
        if (main) {
          ring.style.display = ''
          ring.style.transform = `translate(${main.left - PAD}px, ${main.top - PAD}px)`
          ring.style.width = `${main.width + PAD * 2}px`
          ring.style.height = `${main.height + PAD * 2}px`
        } else ring.style.display = 'none'
      }
      // Карточка — с той стороны цели, где больше места; без цели — внизу.
      const card = cardRef.current
      if (card) {
        const top = Math.min(...rects.filter(Boolean).map((r) => r!.top))
        const bottom = Math.max(...rects.filter(Boolean).map((r) => r!.bottom))
        if (!main || cur === 'offer' || cur === 'done') {
          card.style.top = ''
          card.style.bottom = 'calc(var(--safe-bottom, 0px) + 24px)'
        } else if (main.top + main.height / 2 > innerHeight / 2) {
          // Цель внизу — карточка над самой верхней подсветкой.
          card.style.top = ''
          card.style.bottom = `${Math.max(12, innerHeight - (rects.length > 1 ? main.top : top) + PAD + 14)}px`
        } else {
          card.style.bottom = ''
          card.style.top = `${bottom + PAD + 14}px`
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Нажатия мимо подсветки гасим. Свободны: карточка обучения, тост,
  // подсвеченные места (если на шаге нужно нажать) и шторки поверх шторки операции.
  useEffect(() => {
    const allowed = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      // Карточка обучения и тост («Записано · Отменить» — его кнопка должна работать).
      if (target.closest('[data-tour-card], [role="status"]')) return true
      const dlg = target.closest('[role="dialog"]')
      if (dlg && !dlg.querySelector('[data-tour="save"]')) return true
      const t = TARGETS[stepRef.current]
      if (!t?.tap) return false
      return t.lit.some((name) => !!target.closest(`[data-tour="${name}"]`))
    }
    const guard = (e: Event) => {
      if (allowed(e.target)) return
      e.stopPropagation()
      e.preventDefault()
    }
    for (const type of ['click', 'pointerdown', 'mousedown'] as const) document.addEventListener(type, guard, true)
    return () => {
      for (const type of ['click', 'pointerdown', 'mousedown'] as const) document.removeEventListener(type, guard, true)
    }
  }, [])

  const modal = step === 'offer' || step === 'done'
  const shown = ORDER.indexOf(step) // шаги действий: 1…6
  const text: Record<Step, string> = {
    offer: reason === 'new' ? tx.offerText : tx.againText,
    plus: tx.plus,
    amount: tx.amount,
    category: tx.category,
    save: tx.save,
    balance: tx.balance,
    analytics: tx.analytics,
    done: tx.doneText,
  }

  return (
    <div className="fixed inset-0 z-[55]" style={{ pointerEvents: 'none' }} data-swipe-ignore>
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {Array.from({ length: MAX_HOLES }, (_, i) => (
              <rect key={i} ref={(n) => { maskRefs.current[i] = n }} rx="18" ry="18" width="0" height="0" fill="black" />
            ))}
          </mask>
        </defs>
        <rect className="tour-dim" x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#tour-mask)" />
      </svg>
      {!modal && <div ref={ringRef} className="tour-ring" style={{ display: 'none' }} />}

      <div
        ref={cardRef}
        key={step}
        data-tour-card
        role="dialog"
        aria-live="polite"
        {...UNMASK}
        className="rise-in absolute inset-x-4 mx-auto max-w-sm rounded-3xl bg-surface-raised p-5 shadow-raised dark:shadow-raised-dark"
        style={{ pointerEvents: 'auto', bottom: 'calc(var(--safe-bottom, 0px) + 24px)' }}
      >
        {!modal && <div className="caption mb-1.5 text-ink-subtle">{tx.step(shown, ORDER.length - 2)}</div>}
        {step === 'offer' && (
          <div className="mb-2 text-[22px] font-extrabold leading-tight text-ink">{reason === 'new' ? tx.offerTitle : tx.againTitle}</div>
        )}
        {step === 'done' && <div className="mb-2 text-[22px] font-extrabold leading-tight text-ink">{tx.doneTitle}</div>}
        <p className="text-[15px] leading-snug text-ink">{text[step]}</p>
        {step === 'done' && askRemind && reminders && <p className="mt-2 text-[15px] leading-snug text-ink-muted">{tx.remindText}</p>}

        {step === 'offer' && (
          <div className="mt-5 flex flex-col gap-2">
            <button onClick={start} className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-base font-bold text-white">
              {tx.start}
            </button>
            <button onClick={exit} className="press-soft w-full rounded-full py-2.5 text-sm font-semibold text-ink-subtle">
              {tx.decline}
            </button>
          </div>
        )}
        {step === 'amount' && hasAmount && (
          <button onClick={() => go('category')} className="press-soft mt-4 w-full rounded-full bg-brand-500 py-3 text-base font-bold text-white">
            {tx.amountReady}
          </button>
        )}
        {step === 'balance' && (
          <button onClick={() => go('analytics')} className="press-soft mt-4 w-full rounded-full bg-brand-500 py-3 text-base font-bold text-white">
            {tx.next}
          </button>
        )}
        {step === 'done' && (
          <div className="mt-5 flex flex-col gap-2">
            {askRemind && reminders ? (
              <>
                <button onClick={() => void finish(true)} className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-base font-bold text-white">
                  {tx.remindOn}
                </button>
                <button onClick={() => void finish(false)} className="press-soft w-full rounded-full py-2.5 text-sm font-semibold text-ink-subtle">
                  {tx.remindOff}
                </button>
              </>
            ) : (
              <button onClick={() => void finish(false)} className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-base font-bold text-white">
                {tx.finish}
              </button>
            )}
          </div>
        )}
        {!modal && (
          <button onClick={exit} className="mt-3 text-[13px] font-medium text-ink-subtle underline-offset-2 active:underline">
            {tx.skip}
          </button>
        )}
      </div>
    </div>
  )
}
