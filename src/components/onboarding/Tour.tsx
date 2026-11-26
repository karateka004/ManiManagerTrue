import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { ArrowDown, Bell, Check, MessageCircle, Pencil, Send, Wallet, type LucideProps } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { detectCurrency } from '../../lib/currencyDetect'
import { reportQuickStart, setReminders } from '../../lib/api'
import { TOUR_DONE_KEY } from '../../lib/introKeys'
import type { TourReason } from '../Intro'
import { CURRENCY_ASKED_KEY } from '../../lib/currencyAsked'
import { botCanWrite, canRequestBotWrite, hapticNotify, hapticTap, requestBotWrite, syncTelegramChrome, tg } from '../../lib/telegram'
import { useBackButton } from '../../lib/useBackButton'
import { showToast } from '../../lib/toast'
import { UNMASK, clarityEvent, clarityKeep, clarityTag } from '../../lib/clarity'
import { burst, prefersReducedMotion, replay } from '../../lib/fx'
import { isLowEnd } from '../../lib/perf'
import { XP_PER_TRANSACTION } from '../../lib/levels'
import { REPORT, IN_SHEET, at, STEPS, CHAPTERS, NEXT_TAB, PLAN_ICONS, CHAPTER_COLOR, TG_BLUE, BELL_RED, CHAPTER_FILL, readSaved, writeSaved, clearSaved, type Step } from './tourSteps'
import { TEXT, type Lang } from './tourText'
import { found, find, isCurrent, TABS, rectOf, MAX_HOLES, DUR, CARD_TAU, SETTLE, spotRect, ringRect, toastRect, sheetShown, foldKeypadIfCramped, newAnim, dot, animate, moving, placeCard, scrollToMakeRoom, type Box, type Side } from './tourGeometry'


/**
 * Обучение новичка (2.10): как в играх — экран затемнён, подсвечено одно место,
 * и человек сам делает действие в настоящем интерфейсе. Четыре главы:
 *   1. Запись: «+» → сумма → категория → «Записать» (трата записывается по-настоящему);
 *   2. Баланс: что он считает и как записать доход → открой «Аналитику»;
 *   3. Аналитика: куда уходят деньги → загляни в «Прогресс»;
 *   4. Прогресс: опыт, уровни, задания → вернись на «Главную» → итог (бот,
 *      ассистент, правка записей, напоминания).
 * Лишних нажатий нет: каждое — действие в самом приложении (переход по
 * вкладкам и есть «дальше»); свои кнопки — только у предложения и итога.
 *
 * Как устроено. Цели помечены в разметке `data-tour="…"` (TabBar, BalanceCard,
 * AddTransactionSheet, герой Аналитики, Rewards). Каждый кадр читаем их
 * рамки и двигаем вырезы затемнения (SVG-маска), кольцо и карточку. Смена цели
 * — перетекание за ~0,45 с: вырез и кольцо едут к новой цели и догоняют её,
 * если она сама в движении (шторка выезжает); карточка идёт за местом пружиной.
 * В DOM пишем, только если что-то сдвинулось: в покое кадр ничего не стоит.
 * Цели на страницах ищем только в открытой вкладке: замер внутри скрытой
 * панели (content-visibility) заставил бы браузер считать её целиком.
 *
 * Шаг засчитываем по самому интерфейсу: шторка открылась, сумма набрана и
 * палец замер (`data-value`), категория выбрана, операция в сторе, вкладка
 * открыта. Нажатия мимо подсветки гасим на document в фазе перехвата и
 * отвечаем на них: карточка качнётся, кольцо вспыхнет. Свободны карточка, тост
 * и шторки поверх шторки операции (валюта, новая категория). Отклик на нажатие
 * мимо — только на короткое касание без сдвига (прокрутка — не промах) и не на
 * то, что подсвечено «посмотреть». Свайп между вкладками выключен по
 * `body[data-touring]` (его проверяет движок свайпа); `aria-modal` — только у
 * предложения и итога: на шагах нужное действие — вне карточки, и экранный
 * диктор не должен запирать фокус в ней. «Назад» Telegram и Escape: на
 * предложении — «Не сейчас», на итоге — «Поехали», на шагах — выход.
 * Слой — z 55: над шторкой операции (51), под вложенными (60) и тостом (90).
 *
 * Цикл кадров засыпает, когда ~15 кадров ничего не менялось: чтение рамок при
 * любой идущей CSS-анимации заставляет браузер пересчитывать стили каждый кадр
 * (на «Прогрессе» — и раскладку). Будят его ввод, прокрутка, смена размера,
 * начало анимаций и переходов, смена шага и стора; страховка — проверка раз в
 * 400 мс. Пульс кольца — три раза на каждую новую цель, не бесконечно.
 *
 * Шаги в админку (/qs, `v: 2`): 0 предложили, 1 начали, 2 открыли запись,
 * 3 записали первую трату, 4 дошли до конца. Только у новичков: повторное
 * предложение (заходит, а записей нет) и обучение по ссылке воронку не трогают.
 * Прошёл до конца — `TOUR_DONE_KEY`, повторно больше не предлагаем. Закрыл
 * приложение посреди — продолжает с того же места (QS_KEY).
 */

/* ------------------------------------------------------------------ */

const NOOP = () => {}
type Tip = [ComponentType<LucideProps>, string, readonly [string, string]]

export function Tour({ onDone, reason = 'new' }: { onDone: () => void; reason?: TourReason }) {
  // Воронка в админке — только про новичков.
  const report = reason === 'new' ? reportQuickStart : NOOP
  const lang: Lang = useStore((s) => s.lang) === 'en' ? 'en' : 'ru'
  const tx = TEXT[lang]
  const [saved] = useState(readSaved)
  const [step, setStep] = useState<Step>(saved.step)
  const [recorded, setRecorded] = useState<string | null>(saved.id)
  const [leaving, setLeaving] = useState(false)
  const stepRef = useRef(step)
  // Вкладка, которую продолжение должно открыть само (см. ниже); '' — открыта.
  const resumeRef = useRef(saved.step === 'analytics' ? 'tab-analytics' : saved.step === 'rewards' ? 'tab-rewards' : '')
  const recordedRef = useRef(recorded)
  const leavingRef = useRef(false)
  // Своё нажатие (вернуть на Главную) защита пропускает.
  const free = useRef(false)

  const press = (name: string) => {
    const e = find(name)
    if (!e) return
    free.current = true
    try {
      e.click()
    } finally {
      free.current = false
    }
  }

  // Будильник цикла кадров (ставит цикл, см. ниже).
  const wakeRef = useRef<() => void>(NOOP)
  const go = (next: Step) => {
    if (stepRef.current === next) return
    stepRef.current = next
    wakeRef.current()
    // Баланс — на Главной: записали с другой вкладки — возвращаемся туда;
    // пролистали вниз — поднимаем к карточке.
    if (next === 'balance') {
      if (!isCurrent('tab-home')) press('tab-home')
      else {
        const b = rectOf('balance')
        if (!b || b.y < 0 || b.y + b.h > innerHeight - 90) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
    }
    // Итог — на Главной с самого верха: её прокручивали под карточку баланса,
    // и кнопка ассистента, о которой говорит совет, оставалась за краем.
    // Кадром позже: вкладка сначала восстанавливает свою прокрутку.
    if (next === 'done') requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }))
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
    const send = () => {
      reported.current = s
      report({ s, e: recorded ? 1 : 0, i: false, v: 2 })
    }
    // Предложение — не сразу: вернувшемуся на новый телефон облако приносит
    // записи через секунду-другую, и он не новичок (тихо уходим, см. ниже).
    // Ответил раньше — следующий шаг покроет и «предложили» (воркер берёт max).
    // Итог — тоже с задержкой: «Поехали» сразу шлёт отчёт с отметкой «дошёл»,
    // и два почти одновременных отчёта могли разминуться в KV — последним ложился
    // тот, что без отметки.
    if (step !== 'offer' && step !== 'done') return send()
    const id = window.setTimeout(
      () => {
        if (!leavingRef.current && stepRef.current === step) send()
      },
      step === 'offer' ? 3000 : 1500,
    )
    return () => clearTimeout(id)
  }, [step, recorded])
  // Пока идёт обучение, пустое место шторки клавиатуру не сворачивает.
  useEffect(() => {
    document.body.setAttribute('data-touring', '')
    return () => document.body.removeAttribute('data-touring')
  }, [])

  // Трата из шторки — шаг пройден (одна новая операция: облако, догнавшее
  // новое устройство, приносит их пачкой). Отменили её тостом, пока смотрим
  // баланс или аналитику, — снова к «+»: показывать нечего.
  useEffect(() => {
    return useStore.subscribe((s, prev) => {
      if (s.transactions === prev.transactions) return
      const cur = stepRef.current
      if (IN_SHEET.has(cur) && s.transactions.length === prev.transactions.length + 1) {
        const before = new Set(prev.transactions.map((x) => x.id))
        const fresh = s.transactions.find((x) => !before.has(x.id))
        if (fresh) {
          recordedRef.current = fresh.id
          setRecorded(fresh.id)
          go('balance')
        }
      } else if (
        (cur === 'balance' || cur === 'analytics' || cur === 'rewards' || cur === 'done') &&
        recordedRef.current &&
        !s.transactions.some((x) => x.id === recordedRef.current)
      ) {
        recordedRef.current = null
        setRecorded(null)
        go('plus')
      } else if (
        reason !== 'link' &&
        !recordedRef.current &&
        ((cur === 'offer' && s.transactions.length > 0) ||
          (cur === 'plus' && s.transactions.length > prev.transactions.length) ||
          (IN_SHEET.has(cur) && s.transactions.length > prev.transactions.length + 1))
      ) {
        // Облако принесло записи: это не новичок, а человек на новом телефоне
        // (или с очищенным кэшем) — даже если «Покажи» он успел нажать. Учебная
        // «первая запись» легла бы в его настоящие данные — тихо уходим, без
        // отчёта и тоста; открытую шторку операции закрываем (её «Назад»).
        clarityEvent('onboarding_returning')
        clearSaved()
        if (sheetShown()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        leave()
      }
      wakeRef.current()
    })
  }, [])

  // Валюта по региону — при ответе на предложение, НЕ при открытии: запись в
  // стор при открытии сохранила бы его, и ушедший с первого экрана в следующий
  // раз считался бы старым пользователем.
  // Валюту, которую человек уже выбирал (метка CURRENCY_ASKED_KEY), не трогаем:
  // повторное обучение или по ссылке меняло выбранный им USD на «местную».
  const applyRegion = () => {
    const s = useStore.getState()
    let asked = false
    try {
      asked = localStorage.getItem(CURRENCY_ASKED_KEY) === '1'
    } catch {
      /* приватный режим */
    }
    const d = detectCurrency()
    if (!asked && s.transactions.length === 0 && s.currency === 'USD' && d.currency !== 'USD') s.setCurrency(d.currency)
    try {
      localStorage.setItem(CURRENCY_ASKED_KEY, '1')
    } catch {
      /* приватный режим */
    }
  }

  // Уход — затемнение гаснет, потом снимаемся.
  const leave = () => {
    if (leavingRef.current) return
    leavingRef.current = true
    // Лист уезжает вниз, как в Telegram, а не гаснет на месте.
    if (cardRef.current?.classList.contains('tour-sheet')) cardRef.current.classList.add('tour-sheet-out')
    setLeaving(true)
    window.setTimeout(onDone, prefersReducedMotion() ? 0 : 200)
  }
  const exit = () => {
    if (leavingRef.current) return
    const s = REPORT[stepRef.current]
    hapticTap()
    clarityEvent('onboarding_exit')
    clarityTag('onboarding_exit_at', stepRef.current)
    report({ s, e: recordedRef.current ? 1 : 0, i: false, x: s, v: 2 })
    applyRegion()
    clearSaved()
    leave()
    // Выход без подтверждения — зато вернуться можно (Настройки → «Пройти обучение»).
    showToast({ text: tx.again })
  }
  const start = () => {
    hapticTap()
    applyRegion()
    // В демо учебная запись пряталась под чужими данными, а баланс показывал
    // демо-доход при тексте «пока доходов нет».
    const st = useStore.getState()
    if (st.demoMode) st.setDemoMode(false)
    // Лист сначала уезжает вниз — потом первая подсказка.
    const card = cardRef.current
    if (!card || prefersReducedMotion()) return go('plus')
    card.classList.add('tour-sheet-out')
    window.setTimeout(() => go('plus'), 200)
  }

  // Напоминания: разрешение боту писать — в конце, когда человек уже понял,
  // зачем. Без разрешения бот не напишет ни разу.
  const reminders = useStore((s) => s.remindersEnabled)
  const [askRemind] = useState(() => tg.isInTelegram && !botCanWrite() && canRequestBotWrite())
  const busy = useRef(false)
  const [waiting, setWaiting] = useState(false)
  /** remind: null — ушли «Назад»: напоминания не трогаем (это не «Не нужно»). */
  const finish = async (remind: boolean | null) => {
    if (busy.current || leavingRef.current) return
    busy.current = true
    if (askRemind && remind !== null) {
      if (remind) {
        // Окно Telegram «разрешить боту писать»: пока ждём — кнопка занята;
        // не ответил за 8 с (окно не пришло) — идём дальше без напоминаний.
        setWaiting(true)
        const granted = await Promise.race([requestBotWrite(), new Promise<boolean>((r) => setTimeout(() => r(false), 8_000))])
        setWaiting(false)
        clarityEvent(granted ? 'bot_write_yes' : 'bot_write_no')
        if (granted) void setReminders(true)
        else useStore.getState().setRemindersEnabled(false)
      } else {
        useStore.getState().setRemindersEnabled(false)
      }
    }
    hapticNotify('success')
    clarityEvent('onboarding_done')
    report({ s: REPORT.done, e: recordedRef.current ? 1 : 0, i: false, d: true, v: 2 })
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1')
    } catch {
      /* приватный режим */
    }
    clearSaved()
    if (!isCurrent('tab-home')) press('tab-home')
    leave()
  }

  // «Назад» Telegram и Escape — общая стопка: на предложении это «Не сейчас»,
  // на итоге — «Поехали», на шагах — выход (шторка операции поверх ловит своё).
  useBackButton(!leaving, () => (stepRef.current === 'done' ? void finish(null) : exit()), STEPS[step].card === 'modal')

  // Шапка и нижняя полоса Telegram — под затемнение: в светлой теме зелёная
  // шапка над тёмным экраном выглядела оторванной. Уходим — как было.
  // Под листом (предложение, итог) затемнение легче — 0,5, как у Telegram, а
  // нижняя полоса — цвета самого листа: низ экрана там — лист.
  const sheetUp = STEPS[step].card === 'modal'
  useEffect(() => {
    const wa = tg.webApp
    if (!wa) return
    const dark = document.documentElement.classList.contains('dark')
    const head = sheetUp ? (dark ? '#070707' : '#1F523D') : dark ? '#050505' : '#163B2C'
    const bg = sheetUp ? (dark ? '#1B1C1A' : '#F6F6F3') : dark ? '#050505' : '#595957'
    try {
      wa.setHeaderColor(head)
    } catch {
      /* старый клиент */
    }
    try {
      if (wa.setBottomBarColor && wa.isVersionAtLeast?.('7.10')) wa.setBottomBarColor(bg)
    } catch {
      /* старый клиент */
    }
  }, [sheetUp])
  useEffect(() => () => syncTelegramChrome(document.documentElement.classList.contains('dark')), [])

  // Продолжение с «Аналитики» или «Прогресса»: приложение открылось на Главной —
  // открываем нужную вкладку сами (панель вкладок могла ещё не встать). Пока не
  // открыли, шаги не двигаются: на «Прогрессе» открытая Главная засчитывалась
  // как «вернулся на Главную» — и сразу показывался итог.
  useEffect(() => {
    const name = resumeRef.current
    if (!name) return
    let tries = 0
    const id = window.setInterval(() => {
      if (isCurrent(name) || ++tries > 20) {
        clearInterval(id)
        resumeRef.current = ''
        wakeRef.current()
      } else if (find(name)) press(name)
    }, 150)
    return () => clearInterval(id)
  }, [])

  // Найденные цели держат узлы DOM — после ухода не держим.
  useEffect(() => () => found.clear(), [])

  const maskRefs = useRef<(SVGRectElement | null)[]>([])
  const ringRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLSpanElement>(null)
  const safeRef = useRef<HTMLDivElement>(null)
  // Высота карточки — из ResizeObserver: читать её каждый кадр незачем.
  const cardH = useRef(0)
  const cardW = useRef(0)
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    cardH.current = card.offsetHeight
    cardW.current = card.offsetWidth
    const ro = new ResizeObserver(() => {
      cardH.current = card.offsetHeight
      cardW.current = card.offsetWidth
      wakeRef.current()
    })
    ro.observe(card)
    return () => ro.disconnect()
  }, [])

  // Каждый кадр: шаг по интерфейсу → рамки целей → вырезы, кольцо, карточка.
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion()
    const dur = reduce ? 0 : isLowEnd() ? 320 : DUR
    const holes = Array.from({ length: MAX_HOLES }, newAnim)
    const ring = newAnim()
    const wrote: string[] = []
    let wroteRing = '-'
    let wroteCard = ''
    let wroteTail = ''
    let wroteSide: Side | '-' = '-'
    // Сторона карточки на этом шаге (держим) и шаг, где страницу уже подкрутили.
    let stick: Side = ''
    let stickStep: Step | '' = ''
    let stepAt = 0
    let scrolledStep: Step | '' = ''
    let wroteHide = false
    let seenStep = ''
    let cardY = NaN
    let cardX = NaN
    let last = performance.now()
    let goneAt = 0
    let lastAmount = -1
    let amountAt = 0
    let folded = false
    // Кадр что-то записал или чего-то ждёт — значит, не спим.
    let busy = false
    let pulsedFor = ''
    // Безопасная зона (вырез, «чёлка», полоска жестов) — по невидимой рамке из CSS-переменных.
    const safe = { top: 0, bottom: 0 }
    const readSafe = () => {
      const s = safeRef.current?.getBoundingClientRect()
      if (!s) return
      safe.top = Math.max(0, s.top)
      safe.bottom = Math.max(0, innerHeight - s.bottom)
    }
    readSafe()
    addEventListener('resize', readSafe)

    const progress = (now: number) => {
      const cur = stepRef.current
      if (cur === 'plus') {
        if (sheetShown()) go('amount')
        return
      }
      if (IN_SHEET.has(cur)) {
        if (!sheetShown()) {
          // Шторку закрыли (свайпом, «Назад») — снова к «+».
          if (!goneAt) goneAt = now
          else if (now - goneAt > 600) {
            goneAt = 0
            go('plus')
          }
          busy = true
          return
        }
        goneAt = 0
        const amount = Number(find('amount')?.dataset.value) || 0
        const cat = find('categories')?.dataset.value ?? ''
        if (amount !== lastAmount) {
          lastAmount = amount
          amountAt = now
        }
        // Сумма есть и палец замер — к категории; выбрана — к «Записать».
        // К клавишам — только если сумму стёрли до нуля: дописал цифру после
        // паузы — остаёмся на категории (раньше шаг скакал туда-обратно).
        const next: Step = amount <= 0 ? 'amount' : cat ? 'save' : cur !== 'amount' || now - amountAt >= SETTLE ? 'category' : 'amount'
        // Ждём паузу после цифры — цикл не засыпает, иначе шаг опоздает.
        if (next === 'amount' && amount > 0) busy = true
        if (next === 'category' && !folded) {
          folded = true
          foldKeypadIfCramped()
        } else if (next === 'amount') folded = false
        go(next)
        return
      }
      if (resumeRef.current) {
        busy = true
        return
      }
      if (cur === 'balance' && isCurrent('tab-analytics')) go('analytics')
      else if (cur === 'analytics' && isCurrent('tab-rewards')) go('rewards')
      else if (cur === 'rewards' && isCurrent('tab-home')) go('done')
    }

    let raf = 0
    let idle = 0
    let sleeping = false
    /** Один кадр: шаг, рамки, запись. Возвращает «что-то ещё идёт». */
    const frame = (now: number): boolean => {
      busy = false
      const dt = Math.min(50, Math.max(0, now - last))
      last = now
      if (leavingRef.current) return false
      const stepBefore = stepRef.current
      progress(now)
      if (stepRef.current !== stepBefore) busy = true
      const def = STEPS[stepRef.current]
      const vw = innerWidth
      const vh = innerHeight

      // Чтение — всё сразу, до записи.
      const live = def.spots.map((s) => spotRect(s, vw, vh))
      const ringLive = def.ring ? ringRect(def.ring, vw) : null
      const toast = toastRect()
      const inSheet = IN_SHEET.has(stepRef.current)
      // Страница целей: открытая вкладка (+ шторка). Сменилась — вырез и кольцо
      // не тянутся со старой, а вырастают на новой (animate).
      const page = (TABS.find(isCurrent) ?? '') + (inSheet ? '|sheet' : '')

      const shown: (Box | null)[] = []
      for (let i = 0; i < MAX_HOLES; i++) {
        const s = def.spots[i]
        const target = live[i] ?? null
        // Шторка — снизу, вместе с листом; остальное — из середины цели.
        const entry = target ? (s?.bleed ? { x: -30, y: vh, w: vw + 60, h: 0, r: 24 } : dot(target)) : undefined
        shown.push(animate(holes[i], s ? s.names.join('+') : '', target, now, dur, page, entry))
      }
      const ringNow = animate(ring, def.ring ?? '', ringLive, now, dur, page, ringLive ? dot(ringLive) : undefined)
      if (ringNow && def.ring && pulsedFor !== def.ring) {
        pulsedFor = def.ring
        if (!reduce && def.card !== 'modal') replay(ringRef.current, 'tour-pulse')
      }

      const keep = live.filter((b): b is Box => !!b)
      if (toast) keep.push(toast)
      const anchor = typeof def.card === 'number' ? (live[def.card] ?? null) : null
      const cur = stepRef.current
      if (stickStep !== cur) {
        stickStep = cur
        stepAt = now
        stick = ''
      }
      // Шаг уже сменился, а React новую карточку ещё не нарисовал: ставить
      // старую на новое место нельзя — были кадры-призраки (пузырь «Твой
      // уровень» на месте листа итога). Ждём; дорисовал — высоту читаем сразу,
      // не дожидаясь ResizeObserver.
      const cardNow = cardRef.current
      const drawn = cardNow?.dataset.step
      if (drawn !== cur) {
        busy = true
      } else if (seenStep !== cur && cardNow) {
        seenStep = cur
        cardH.current = cardNow.offsetHeight
        cardW.current = cardNow.offsetWidth
      }
      const place = placeCard(def.card, anchor, keep, cardH.current, vh, safe, stick)
      if (place.side) stick = place.side
      else if (anchor && scrolledStep !== cur && now - stepAt > DUR) {
        // Негде встать у цели — один раз подкручиваем страницу (низкий экран).
        // Не сразу: вкладка доезжает, карточка успевает сменить содержимое.
        scrolledStep = cur
        scrollToMakeRoom(anchor, safe.top)
      }
      // Больше трети экрана — переносим сразу (содержимое и так меняется
      // с проявлением): пролетая 600 px, карточка на полпути висела посреди
      // выезжающей шторки.
      // По горизонтали — к цели, если экран шире карточки (альбомная): по центру
      // она закрывала подсвеченное, а хвостик упирался в край. Цель во всю
      // ширину, рядом с которой места нет, — справа: там у карточек пусто.
      const w = cardW.current || Math.min(vw - 32, 384)
      const centered = (vw - w) / 2
      let left = centered
      if (anchor && vw - 32 > w + 8) {
        const cx = anchor.x + anchor.w / 2
        left = anchor.w > vw * 0.6 && !place.side ? vw - 16 - w : Math.min(Math.max(16, cx - w / 2), vw - 16 - w)
      }
      const jump = Number.isNaN(cardY) || reduce || Math.abs(place.y - cardY) > vh / 3
      const k = 1 - Math.exp(-dt / CARD_TAU)
      cardY = jump ? place.y : cardY + (place.y - cardY) * k
      cardX = jump || Number.isNaN(cardX) ? left : cardX + (left - cardX) * k
      if (Math.abs(cardY - place.y) < 0.3) cardY = place.y
      else busy = true
      if (Math.abs(cardX - left) < 0.3) cardX = left
      else busy = true
      for (let i = 0; i < MAX_HOLES; i++) if (moving(holes[i], now, dur)) busy = true
      if (moving(ring, now, dur)) busy = true

      // Запись — только если что-то сдвинулось.
      for (let i = 0; i < MAX_HOLES; i++) {
        const node = maskRefs.current[i]
        const b = shown[i]
        if (!node) continue
        const sig = b && b.w > 0.5 && b.h > 0.5 ? `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)} ${b.r.toFixed(1)}` : ''
        if (sig === wrote[i]) continue
        wrote[i] = sig
        busy = true
        if (!b || !sig) {
          node.setAttribute('width', '0')
          node.setAttribute('height', '0')
          continue
        }
        node.setAttribute('x', b.x.toFixed(1))
        node.setAttribute('y', b.y.toFixed(1))
        node.setAttribute('width', b.w.toFixed(1))
        node.setAttribute('height', b.h.toFixed(1))
        node.setAttribute('rx', Math.max(0, b.r).toFixed(1))
        node.setAttribute('ry', Math.max(0, b.r).toFixed(1))
      }
      const rn = ringRef.current
      if (rn) {
        const sig = ringNow && ringNow.w > 1 && ringNow.h > 1 ? `${ringNow.x.toFixed(1)} ${ringNow.y.toFixed(1)} ${ringNow.w.toFixed(1)} ${ringNow.h.toFixed(1)} ${ringNow.r.toFixed(1)}` : ''
        if (sig !== wroteRing) {
          wroteRing = sig
          busy = true
          if (!ringNow || !sig) rn.style.display = 'none'
          else {
            rn.style.display = ''
            rn.style.transform = `translate3d(${ringNow.x.toFixed(1)}px, ${ringNow.y.toFixed(1)}px, 0)`
            rn.style.width = `${ringNow.w.toFixed(1)}px`
            rn.style.height = `${ringNow.h.toFixed(1)}px`
            rn.style.borderRadius = `${ringNow.r.toFixed(1)}px`
            // Пульс расходится на ~9 px при любом размере кольца.
            rn.style.setProperty('--px', (1 + 18 / Math.max(ringNow.w, 18)).toFixed(3))
            rn.style.setProperty('--py', (1 + 18 / Math.max(ringNow.h, 18)).toFixed(3))
          }
        }
      }
      const pos = posRef.current
      if (pos && drawn === cur) {
        const sig = `${(cardX - centered).toFixed(1)}px, ${cardY.toFixed(1)}px`
        if (sig !== wroteCard) {
          // Первая запись места — и карточку можно показывать (до неё она
          // стояла бы на нуле: кадр вверху экрана).
          if (!wroteCard) pos.style.visibility = 'visible'
          wroteCard = sig
          busy = true
          pos.style.transform = `translate3d(${sig}, 0)`
        }
        // Карточка баланса — когда шторка ушла: поверх уезжающего листа она
        // выглядела как часть шторки.
        const hide = cur === 'balance' && sheetShown()
        if (hide !== wroteHide) {
          wroteHide = hide
          busy = true
          pos.style.opacity = hide ? '0' : ''
        }
        if (hide) busy = true
      }
      const cardEl = drawn === cur ? cardRef.current : null
      if (cardEl && place.side !== wroteSide) {
        wroteSide = place.side
        if (place.side) cardEl.setAttribute('data-side', place.side)
        else cardEl.removeAttribute('data-side')
      }
      const tail = tailRef.current
      if (tail && anchor && place.side && drawn === cur) {
        const x = Math.min(Math.max(anchor.x + anchor.w / 2 - cardX, 28), w - 28)
        const sig = x.toFixed(1)
        if (sig !== wroteTail) {
          wroteTail = sig
          tail.style.transform = `translateX(${(x - 8).toFixed(1)}px) rotate(45deg)`
        }
      }
      return busy
    }
    const tick = (now: number) => {
      if (frame(now)) idle = 0
      else idle += 1
      // ~15 спокойных кадров — засыпаем до ввода, прокрутки или анимации.
      if (idle >= 15 || leavingRef.current) {
        sleeping = true
        return
      }
      raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      idle = 0
      if (!sleeping || leavingRef.current) return
      sleeping = false
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    wakeRef.current = wake
    // Будильники: ввод, прокрутка (и внутри шторки), размер, начало анимаций
    // и переходов (шторка выезжает, тост, вкладка). Страховка — раз в 400 мс:
    // один кадр без ожидания; что-то сдвинулось — просыпаемся.
    const opts = { capture: true, passive: true } as const
    const wakeOn = ['pointerdown', 'pointerup', 'keydown', 'input', 'transitionrun', 'animationstart'] as const
    for (const type of wakeOn) document.addEventListener(type, wake, opts)
    addEventListener('scroll', wake, opts)
    addEventListener('resize', wake)
    // Раз в секунду, а не чаще: чтение рамок при идущих CSS-анимациях страницы
    // (Аналитика, Прогресс) — пересчёт стилей, и опрос каждые 400 мс стоил втрое.
    const poll = window.setInterval(() => {
      if (sleeping && !leavingRef.current && frame(performance.now())) wake()
    }, 1000)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(poll)
      wakeRef.current = NOOP
      for (const type of wakeOn) document.removeEventListener(type, wake, opts)
      removeEventListener('scroll', wake, opts)
      removeEventListener('resize', wake)
      removeEventListener('resize', readSafe)
    }
  }, [])

  // Нажатия мимо подсветки гасим и отвечаем на них: карточка качнётся, кольцо
  // вспыхнет. Свободны: карточка, тост, места для нажатия на шаге и шторки
  // поверх шторки операции.
  useEffect(() => {
    if (leaving) return
    let nudgedAt = 0
    // Касание мимо: где и когда началось. Отвечаем на отпускание — если палец
    // почти не сдвинулся: прокрутка затемнённой части — не промах (раньше
    // карточка качалась на каждую попытку пролистать «Аналитику»).
    let down: { id: number; x: number; y: number; t: number; look: boolean } | null = null
    // Подсвечено «посмотреть» (баланс, «Потрачено», уровень): нажатие гасим, но
    // не ругаемся — человек делает ровно то, что просили.
    const lookOnly = (target: EventTarget | null) =>
      target instanceof Element && STEPS[stepRef.current].spots.some((s) => !s.tap && s.names.some((n) => !!target.closest(at(n))))
    const allowed = (target: EventTarget | null) => {
      if (free.current) return true
      if (!(target instanceof Element)) return false
      // Карточка обучения и тост («Записано · Отменить» — его кнопка должна работать).
      if (target.closest('[data-tour-card], [role="status"]')) return true
      const dlg = target.closest('[role="dialog"]')
      if (dlg && !dlg.querySelector(at('save'))) return true
      return STEPS[stepRef.current].spots.some((s) => !!s.tap && !!target.closest(s.tap))
    }
    const guard = (e: Event) => {
      if (allowed(e.target)) return
      e.stopPropagation()
      e.preventDefault()
      if (e.type !== 'pointerdown') return
      const p = e as PointerEvent
      down = { id: p.pointerId, x: p.clientX, y: p.clientY, t: performance.now(), look: lookOnly(e.target) }
    }
    const nudge = () => {
      const now = performance.now()
      if (now - nudgedAt < 450) return
      nudgedAt = now
      hapticTap()
      if (prefersReducedMotion()) {
        // Без движения: кольцо на миг ярче.
        const ring = ringRef.current
        ring?.classList.add('tour-lit')
        window.setTimeout(() => ring?.classList.remove('tour-lit'), 420)
        return
      }
      // Лист во всю ширину не качается вбок (открывал затемнение по краям) —
      // лёгкий подскок, как у листов Telegram.
      replay(shellRef.current, STEPS[stepRef.current].card === 'modal' ? 'tour-nudge-y' : 'tour-nudge')
      replay(ringRef.current, 'tour-flash')
    }
    const up = (e: PointerEvent) => {
      const d = down
      down = null
      if (!d || d.id !== e.pointerId || d.look) return
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 700) return
      nudge()
    }
    const cancel = () => {
      down = null
    }
    const types = ['click', 'pointerdown', 'mousedown'] as const
    for (const type of types) document.addEventListener(type, guard, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', cancel, true)
    return () => {
      for (const type of types) document.removeEventListener(type, guard, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', cancel, true)
    }
  }, [leaving])

  // Итог — с конфетти от галочки.
  const badgeRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (step !== 'done') return
    const id = window.setTimeout(() => burst(badgeRef.current, { confetti: true, count: 18, spread: 80 }), 260)
    return () => clearTimeout(id)
  }, [step])

  const def = STEPS[step]
  const modal = def.card === 'modal'
  const recordedType = recorded ? useStore.getState().transactions.find((x) => x.id === recorded)?.type : undefined
  // «Первая запись!» — только если она и правда первая (повтор из Настроек — нет).
  const firstEver = useStore.getState().transactions.length <= 1
  // «Пока доходов нет, он в минусе» — только если их в этом месяце и правда нет.
  const incomeThisMonth = (() => {
    const now = new Date()
    return useStore
      .getState()
      .transactions.some((x) => x.type === 'income' && new Date(x.date).getMonth() === now.getMonth() && new Date(x.date).getFullYear() === now.getFullYear())
  })()
  const compact: Partial<Record<Step, readonly [string, string]>> = {
    plus: [tx.plusTitle, tx.plusText],
    amount: [tx.amountTitle, tx.amountText],
    category: [tx.categoryTitle, tx.categoryText],
    save: [tx.saveTitle, tx.saveText],
  }
  const info: Partial<Record<Step, readonly [string, string, string]>> = {
    balance: [firstEver ? tx.balanceTitle : tx.balanceTitleMore, recordedType === 'income' ? tx.balanceIncome : incomeThisMonth ? tx.balanceWithIncome : tx.balanceExpense, tx.toAnalytics],
    analytics: [tx.analyticsTitle, tx.analyticsText, tx.toRewards],
    rewards: [tx.rewardsTitle, tx.rewardsText, tx.toHome],
  }
  // Не больше двух советов: итог и так последний экран перед работой.
  const tips: Tip[] = tg.isInTelegram
    ? [
        [Send, TG_BLUE, tx.tipBot],
        [MessageCircle, CHAPTER_COLOR[3], tx.tipAsk],
      ]
    : [[Pencil, CHAPTER_COLOR[2], tx.tipEdit]]
  if (askRemind && reminders) tips.push([Bell, BELL_RED, tx.remindText])
  const short = compact[step]
  const long = info[step]

  return (
    <div className={`fixed inset-0 z-[55] ${leaving ? 'tour-out' : ''}`} style={{ pointerEvents: 'none' }} data-swipe-ignore>
      <div ref={safeRef} className="absolute inset-x-0" style={{ top: 'var(--safe-top, 0px)', bottom: 'var(--safe-bottom, 0px)' }} aria-hidden />
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {Array.from({ length: MAX_HOLES }, (_, i) => (
              <rect key={i} ref={(n) => { maskRefs.current[i] = n }} width="0" height="0" fill="black" />
            ))}
          </mask>
        </defs>
        {/* Под листом — легче (0,5), как затемнение под листами Telegram; на шагах — 0,64. */}
        <rect className="tour-dim" x="0" y="0" width="100%" height="100%" fill={modal ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.64)'} mask="url(#tour-mask)" />
      </svg>
      <div ref={ringRef} className="tour-ring" style={{ display: 'none' }} />

      <div ref={posRef} className="tour-pos" data-modal={modal ? '' : undefined}>
        <div ref={shellRef}>
          <div
            ref={cardRef}
            data-tour-card
            data-step={step}
            data-modal={modal ? '' : undefined}
            data-top={def.card === 'top' ? '' : undefined}
            role="dialog"
            aria-modal={modal ? 'true' : undefined}
            aria-labelledby="tour-title"
            {...UNMASK}
            className={`tour-card ${modal ? 'tour-sheet' : 'tour-tip'}`}
            style={{ pointerEvents: leaving ? 'none' : 'auto' }}
          >
            <span ref={tailRef} className="tour-tail" aria-hidden />
            {/* Главы — полосками, как у историй Telegram; «Пропустить» — на той же линии.
                Кнопка высотой 44 px (цель касания), но строку не раздувает: поля −20 px. */}
            {!modal && (
              <div className="relative z-[1] mb-3 flex items-center gap-3">
                <div className="flex flex-1 gap-1" aria-hidden>
                  {/* Пройденное — цветом своей главы (те же цвета, что в плане на
                      предложении), текущая заполняется по шагам. */}
                  {Array.from({ length: CHAPTERS }, (_, i) => (
                    <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[.3]">
                      {i <= def.chapter && (
                        <span
                          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                          style={{ width: `${(i < def.chapter ? 1 : (CHAPTER_FILL[step] ?? 1)) * 100}%`, background: CHAPTER_COLOR[i] }}
                        />
                      )}
                    </span>
                  ))}
                </div>
                <span className="sr-only">{tx.chapter.replace('{n}', String(def.chapter + 1)).replace('{all}', String(CHAPTERS))}</span>
                {/* «Пропустить» словом, а не крестиком: «×» в приложении закрывает
                    один слой, а здесь уходит всё обучение. */}
                <button
                  type="button"
                  onClick={exit}
                  aria-label={tx.skipLabel}
                  className="press-soft -my-5 -mr-2 flex h-11 shrink-0 items-center rounded-full px-2.5 text-[13px] font-semibold text-white/[.6]"
                >
                  {tx.skip}
                </button>
              </div>
            )}
            {/* Объявляется только сменяемое содержимое: на всём окне диктор на каждом
                шаге заново читал полоску глав и «Пропустить обучение». */}
            <div key={step} className="tour-swap relative" aria-live="polite">
              {step === 'offer' && (
                <>
                  <div className="tour-hero mx-auto flex items-center justify-center rounded-full text-white" aria-hidden>
                    <Wallet size={40} strokeWidth={2.1} />
                  </div>
                  <div id="tour-title" className="tour-sheet-title mt-4 text-center font-extrabold leading-tight text-ink">
                    {reason === 'new' ? tx.offerTitle : tx.againTitle}
                  </div>
                  <p className="tour-sheet-text mx-auto mt-1.5 max-w-[320px] text-center text-[15px] leading-snug text-ink-muted">
                    {reason === 'new' ? tx.offerText : tx.againText}
                  </p>
                  <ol className="tour-list stagger mt-5">
                    {tx.plan.map((label, i) => {
                      const Icon = PLAN_ICONS[i]
                      return (
                        <li key={label} className="flex items-center gap-3 pl-3.5">
                          <span className="tour-ico" style={{ background: CHAPTER_COLOR[i] }} aria-hidden>
                            <Icon size={18} strokeWidth={2.3} />
                          </span>
                          <span className="tour-row min-w-0 flex-1 pr-3.5 text-[15px] font-semibold leading-snug text-ink">{label}</span>
                        </li>
                      )
                    })}
                  </ol>
                  {/* Кнопки прилипают к низу листа: на низком экране и в альбомной
                      список прокручивается, а «Покажи» и «Не сейчас» всегда видны. */}
                  <div className="tour-actions">
                    <button type="button" onClick={start} className="tour-main press-soft">
                      {tx.start}
                    </button>
                    <button type="button" onClick={exit} className="tour-second press-soft">
                      {tx.decline}
                    </button>
                  </div>
                </>
              )}

              {(short || long) && (
                <div>
                  <div>
                    {short && (
                      <>
                        <div id="tour-title" className="text-[15px] font-bold leading-tight text-white">
                          {short[0]}
                        </div>
                        <p className="mt-1 text-[14px] leading-[19px] text-white/[.72]">{short[1]}</p>
                      </>
                    )}
                    {long && (
                      <>
                        <div id="tour-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-bold leading-tight text-white">
                          {long[0]}
                          {step === 'balance' && (
                            <span className="rounded-full bg-white/[.12] px-2 py-0.5 text-[12px] font-extrabold text-white">+{XP_PER_TRANSACTION} XP</span>
                          )}
                        </div>
                        <p className="mt-1 text-[14px] leading-[19px] text-white/[.72]">{long[1]}</p>
                        {/* Что нажать дальше — кольцо уже на этой вкладке. Строка выглядит
                            как ссылка — пусть и работает как она: открывает ту же вкладку. */}
                        <button
                          type="button"
                          onClick={() => {
                            const tab = NEXT_TAB[step]
                            if (!tab) return
                            hapticTap()
                            press(tab)
                          }}
                          className="press-soft -mx-1 mt-1 flex min-h-[44px] items-center gap-2 rounded-full px-1 text-left text-[14px] font-bold text-brand-300"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400/[.2]">
                            <ArrowDown size={14} strokeWidth={2.6} />
                          </span>
                          {long[2]}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {step === 'done' && (
                <>
                  <span ref={badgeRef} className="tour-check tour-hero mx-auto flex items-center justify-center rounded-full text-white" aria-hidden>
                    <Check size={40} strokeWidth={3} />
                  </span>
                  <div id="tour-title" className="tour-sheet-title mt-4 text-center font-extrabold leading-tight text-ink">
                    {tx.doneTitle}
                  </div>
                  <p className="tour-sheet-text mx-auto mt-1.5 max-w-[320px] text-center text-[15px] leading-snug text-ink-muted">{tx.doneText}</p>
                  {/* Советы — строками настроек Telegram: заголовок и подпись. */}
                  <ul className="tour-list stagger mt-5">
                    {tips.map(([Icon, color, [head, sub]]) => (
                      <li key={head} className="flex items-center gap-3 pl-3.5">
                        <span className="tour-ico" style={{ background: color }} aria-hidden>
                          <Icon size={18} strokeWidth={2.3} />
                        </span>
                        <span className="tour-row min-w-0 flex-1 pr-3.5">
                          <span className="block text-[15px] font-semibold leading-snug text-ink">{head}</span>
                          <span className="block text-[13px] leading-snug text-ink-subtle">{sub}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="tour-actions">
                    {askRemind && reminders ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void finish(true)}
                          disabled={waiting}
                          aria-busy={waiting || undefined}
                          className="tour-main press-soft disabled:opacity-80"
                        >
                          {waiting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
                          {tx.remindOn}
                        </button>
                        <button
                          type="button"
                          onClick={() => void finish(false)}
                          disabled={waiting}
                          className="tour-second press-soft"
                        >
                          {tx.remindOff}
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => void finish(false)} className="tour-main press-soft">
                        {tx.finish}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
