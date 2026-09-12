import { useEffect, useRef, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import { askAssistant, type AskError } from '../lib/api'
import { useT, type TFunc } from '../lib/i18n'
import { hapticSelect, hapticNotify } from '../lib/telegram'

interface Props {
  open: boolean
  onClose: () => void
}

interface Msg {
  id: number
  from: 'me' | 'ai'
  text: string
}

/** Готовые вопросы на пустом экране: чистое поле ввода отвечать не помогает. */
const STARTERS = ['ai.q1', 'ai.q2', 'ai.q3', 'ai.q4'] as const

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
 * никто не возвращается.
 */
export function AssistantSheet({ open, onClose }: Props) {
  const t = useT()
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
    setMessages((prev) => [...prev, { id: nextId.current++, from: 'me', text }])

    const res = await askAssistant(text)
    setBusy(false)
    if (res.ok) hapticNotify('success')
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, from: 'ai', text: res.ok ? res.answer : t(ERROR_KEY[res.error]) },
    ])
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
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-[80] flex h-[92vh] flex-col rounded-t-5xl bg-surface-raised shadow-raised"
          >
            <Head t={t} onClose={onClose} />

            <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-2">
              {messages.length === 0 ? (
                <Empty t={t} onPick={ask} busy={busy} />
              ) : (
                <div className="flex flex-col gap-3 py-2">
                  {messages.map((msg) =>
                    msg.from === 'me' ? <Mine key={msg.id} text={msg.text} /> : <Theirs key={msg.id} text={msg.text} />,
                  )}
                  {busy && <Thinking />}
                </div>
              )}
            </div>

            <Composer t={t} value={draft} onChange={setDraft} onSend={() => ask(draft)} busy={busy} />
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Head({ t, onClose }: { t: TFunc; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 px-5 pb-3 pt-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
        <Sparkles size={18} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1 text-[17px] font-extrabold text-ink">{t('ai.title')}</div>
      <button
        onClick={onClose}
        aria-label="×"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-ink-muted transition-transform active:scale-95"
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
            className="rounded-2xl bg-surface-sunken px-4 py-3 text-left text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {t(key)}
          </button>
        ))}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-subtle">{t('ai.privacy')}</p>
    </div>
  )
}

function Mine({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-brand-500 px-4 py-2.5 text-[15px] font-semibold text-white">
        {text}
      </div>
    </div>
  )
}

/**
 * Ответ ассистента. Главное число выделяем сами — тем же правилом, что в чате с
 * ботом: модель присылает обычный текст, разметку ей не доверяем.
 */
function Theirs({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
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
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-lg bg-surface-sunken px-4 py-4">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-subtle"
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
      className="flex items-end gap-2 border-t border-surface-sunken px-4 pt-3"
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition-transform active:scale-95 disabled:opacity-40"
      >
        <ArrowUp size={20} strokeWidth={2.6} />
      </button>
    </div>
  )
}
