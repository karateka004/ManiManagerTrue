import { useEffect, useRef, useState } from 'react'
import { BottomSheet, useSheetDrag } from './ui/BottomSheet'
import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  Calendar,
  Lightbulb,
  LineChart,
  MessageCircle,
  PieChart,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { askAssistant, type AskCard, type AskError, type AskIcon, type AskTurn } from '../lib/api'
import { useT, type TFunc } from '../lib/i18n'
import { hapticSelect, hapticNotify } from '../lib/telegram'
import { useStore } from '../store/transactions'

interface Props {
  open: boolean
  onClose: () => void
}

interface Msg {
  id: number
  from: 'me' | 'ai'
  text: string
  /** Ответ карточкой (воркер 2.3+); нет — старый воркер, показываем текст. */
  card?: AskCard
  /** Ответ, а не ошибка: только такие реплики уходят в память разговора. */
  answered?: boolean
}

/** Иконки разделов ответа — линейные, как во всём приложении (цвет — только у категорий). */
const SECTION_ICON: Record<AskIcon, LucideIcon> = {
  money: Wallet,
  chart: LineChart,
  calendar: Calendar,
  budget: PiggyBank,
  category: PieChart,
  goal: Target,
  income: TrendingUp,
  warning: AlertTriangle,
  tip: Lightbulb,
  help: BookOpen,
}

/** Память разговора: три последних вопроса с ответами — «а в прошлом месяце?» понятно. */
function historyOf(messages: Msg[]): AskTurn[] {
  const turns: AskTurn[] = []
  for (let i = 1; i < messages.length; i++) {
    const q = messages[i - 1]
    const a = messages[i]
    if (q.from === 'me' && a.from === 'ai' && a.answered) turns.push({ q: q.text, a: a.text })
  }
  return turns.slice(-3)
}

/** Готовые вопросы на пустом экране: чистое поле ввода отвечать не помогает. */
const STARTERS = ['ai.q1', 'ai.q2', 'ai.q3', 'ai.q4', 'ai.q5'] as const

const ERROR_KEY: Record<AskError, string> = {
  quota: 'ai.err_quota',
  unavailable: 'ai.err_unavailable',
  unclear: 'ai.err_unclear',
  looks_like_record: 'ai.err_record',
}

/**
 * Ассистент: вопросы про свои деньги прямо в приложении.
 *
 * Считает и отвечает воркер (POST /ask) по итогам этого пользователя — теми же
 * числами, что показывает приложение. Наружу уходит текст вопроса и выжимка по
 * суммам; список операций не отправляется, и на экране об этом сказано прямо.
 *
 * Переписка живёт только пока открыт экран. Хранить её в сторе значило бы
 * тащить чужие формулировки в синкаемый блоб и в облако — ради ленты, к которой
 * никто не возвращается. Пока экран открыт, три последних реплики уходят с
 * каждым вопросом: так «а в прошлом месяце?» продолжает прошлый.
 *
 * Ответ — карточка: заголовок, суть, разделы строк «параметр — значение» и
 * совет. Числа в ней воркер сверил с итогами человека.
 */
export function AssistantSheet({ open, onClose }: Props) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)

  // Каждое открытие — чистый лист: вопрос про деньги задают про «сейчас».
  useEffect(() => {
    if (!open) return
    setMessages([])
    setDraft('')
    setBusy(false)
  }, [open])

  // Новое сообщение всегда должно быть видно.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    hapticSelect()
    setDraft('')
    setBusy(true)
    const history = historyOf(messages)
    setMessages((prev) => [...prev, { id: nextId.current++, from: 'me', text }])

    const res = await askAssistant(text, history, lang === 'en' ? 'en' : 'ru')
    setBusy(false)
    if (res.ok) hapticNotify('success')
    setMessages((prev) => [
      ...prev,
      res.ok
        ? { id: nextId.current++, from: 'ai', text: res.answer, card: res.card, answered: true }
        : { id: nextId.current++, from: 'ai', text: t(ERROR_KEY[res.error]) },
    ])
  }

  // Продолжения показываем только под последним ответом: под старыми они уже
  // не к месту, а лента из чипов читалась бы хуже самих ответов.
  const last = messages[messages.length - 1]
  const followups = !busy && last?.from === 'ai' ? last.card?.followups ?? [] : []

  return (
    <BottomSheet open={open} onClose={onClose} layout="flex" height="92vh" maxHeight="92vh" padBottom={null}>
      <Head t={t} onClose={onClose} />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
        {messages.length === 0 ? (
          <Empty t={t} onPick={ask} busy={busy} />
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {messages.map((msg) =>
              msg.from === 'me' ? (
                <Mine key={msg.id} text={msg.text} />
              ) : msg.card ? (
                <CardBubble key={msg.id} card={msg.card} />
              ) : (
                <Theirs key={msg.id} text={msg.text} />
              ),
            )}
            {busy && <Thinking />}
            {followups.length > 0 && <Followups items={followups} onPick={ask} />}
          </div>
        )}
      </div>

      <Composer t={t} value={draft} onChange={setDraft} onSend={() => ask(draft)} busy={busy} />
    </BottomSheet>
  )
}

function Head({ t, onClose }: { t: TFunc; onClose: () => void }) {
  // За шапку можно тянуть шторку вниз — как за ручку.
  const startDrag = useSheetDrag()
  return (
    <div onPointerDown={startDrag} className="flex shrink-0 touch-none items-center gap-3 px-5 pb-3 pt-0.5">
      <MessageCircle size={20} strokeWidth={2.2} className="text-ink-subtle" />
      <div className="min-w-0 flex-1 text-[17px] font-extrabold text-ink">{t('ai.title')}</div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        aria-label={t('common.close')}
        className="press flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
      >
        <X size={18} strokeWidth={2.4} />
      </button>
    </div>
  )
}

/** Пустой экран: что это такое, готовые вопросы и честная строчка про приватность. */
function Empty({ t, onPick, busy }: { t: TFunc; onPick: (q: string) => void; busy: boolean }) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <p className="text-[15px] leading-relaxed text-ink-subtle">{t('ai.intro')}</p>
      <div className="flex flex-col gap-2">
        {STARTERS.map((key) => (
          <button
            key={key}
            disabled={busy}
            onClick={() => onPick(t(key))}
            className="press-soft rounded-2xl bg-surface-sunken px-4 py-3 text-left text-[15px] font-semibold text-ink disabled:opacity-50"
          >
            {t(key)}
          </button>
        ))}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-subtle">{t('ai.privacy')}</p>
    </div>
  )
}

/**
 * Ответ карточкой. Та же структура, что в чате с ботом: заголовок, суть,
 * разделы со строками «параметр — значение» (значение жирным и выровнено
 * вправо — суммы читаются столбиком) и совет. Разделы отбиты линией слева, а
 * не рамками: карточка в карточке — против правил оформления.
 */
function CardBubble({ card }: { card: AskCard }) {
  return (
    <div className="bubble-in-l flex justify-start">
      <div className="w-full max-w-[92%] rounded-3xl rounded-bl-lg bg-surface-sunken px-4 py-3 text-ink">
        {card.title && <div className="text-[16px] font-extrabold leading-snug">{card.title}</div>}
        {card.lead && <p className="mt-1 text-[15px] leading-relaxed">{card.lead}</p>}
        {card.sections.map((s, i) => {
          const Icon = s.icon ? SECTION_ICON[s.icon] : null
          return (
            <div key={i} className="mt-3">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink-muted">
                {Icon && <Icon size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />}
                <span className="min-w-0 truncate">{s.heading}</span>
              </div>
              <div className="mt-1.5 border-l-2 border-hairline pl-3">
                {s.rows.map((r, j) => (
                  <div key={j} className="flex items-baseline justify-between gap-3 py-0.5 text-[14px] leading-snug">
                    <span className="min-w-0 text-ink-muted">{r.label}</span>
                    <span className="shrink-0 text-right font-bold tabular-nums">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {card.tip && (
          <div className="mt-3 flex gap-2 text-[14px] leading-snug text-ink-muted">
            <Lightbulb size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-ink-subtle" />
            <span>{card.tip}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Вопросы-продолжения под последним ответом: нажал — спросил. */
function Followups({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  return (
    <div className="stagger flex flex-wrap gap-2 pl-1">
      {items.map((q) => (
        <button
          key={q}
          onClick={() => onPick(q)}
          className="press-soft rounded-full bg-surface-raised px-3.5 py-2 text-left text-[14px] font-semibold text-ink shadow-soft"
        >
          {q}
        </button>
      ))}
    </div>
  )
}

function Mine({ text }: { text: string }) {
  return (
    <div className="bubble-in-r flex justify-end">
      <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-brand-500 px-4 py-2.5 text-[15px] font-semibold text-white">
        {text}
      </div>
    </div>
  )
}

/**
 * Ответ текстом — ошибка или старый воркер без карточек. Главное число
 * выделяем сами: модель присылает обычный текст, разметку ей не доверяем.
 */
function Theirs({ text }: { text: string }) {
  return (
    <div className="bubble-in-l flex justify-start">
      <div className="max-w-[92%] rounded-3xl rounded-bl-lg bg-surface-sunken px-4 py-3 text-[15px] leading-relaxed text-ink">
        {text.split(/\n{2,}/).map((para, i) => (
          <p key={i} className={i > 0 ? 'mt-2.5' : undefined}>
            {i === 0 ? withAccent(para) : para}
          </p>
        ))}
      </div>
    </div>
  )
}

/**
 * Первое денежное значение в абзаце — жирным.
 *
 * Тот же приём, что в чате: модель пишет текст, а выделяет его наш код. Так
 * ответ везде выглядит одинаково, и доверять модели разметку не приходится.
 */
const MONEY = /\d+(?:[   ]\d{3})*(?:[.,]\d{1,2})?(?:[   ]?(?:[₴$€£¥₸₺₽₹]|zł|Br))?/u

function withAccent(text: string) {
  const m = text.match(MONEY)
  if (!m || m.index === undefined) return text
  return (
    <>
      {text.slice(0, m.index)}
      <b className="font-extrabold">{m[0]}</b>
      {text.slice(m.index + m[0].length)}
    </>
  )
}

/**
 * Ожидание ответа. Три точки на CSS-анимации, а не на framer: в свёрнутом
 * webview rAF приостановлен, и framer-анимация просто не стартует — точки
 * должны остаться видимыми в любом случае (см. «Грабли» в CLAUDE.md).
 */
function Thinking() {
  return (
    <div className="bubble-in-l flex justify-start">
      <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-lg bg-surface-sunken px-4 py-4">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-subtle"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function Composer({
  t,
  value,
  onChange,
  onSend,
  busy,
}: {
  t: TFunc
  value: string
  onChange: (v: string) => void
  onSend: () => void
  busy: boolean
}) {
  return (
    <div
      className="flex items-end gap-2 border-t border-hairline px-4 pt-3"
      style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)' }}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 300))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        rows={1}
        placeholder={t('ai.placeholder')}
        className="max-h-28 min-h-[44px] flex-1 resize-none rounded-3xl bg-surface-sunken px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-subtle"
      />
      <button
        onClick={onSend}
        disabled={busy || !value.trim()}
        aria-label={t('ai.send')}
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition-opacity disabled:opacity-40"
      >
        <ArrowUp size={20} strokeWidth={2.6} />
      </button>
    </div>
  )
}
