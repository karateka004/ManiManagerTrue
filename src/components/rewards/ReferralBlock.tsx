import { useState } from 'react'
import { CoinAmount } from './CoinAmount'
import { Send } from 'lucide-react'
import { buildReferralLink, type ReferralFriend } from '../../lib/api'
import { REF_REWARD } from '../../store/transactions'
import { openTelegramLink, hapticTap, hapticSelect } from '../../lib/telegram'
import { dayjs } from '../../lib/format'
import type { TFunc } from '../../lib/i18n'

/** Реферальный блок: ссылка-приглашение + список присоединившихся друзей. */
export function ReferralBlock({ count, friends, t }: { count: number | null; friends: ReferralFriend[]; t: TFunc }) {
  const [copied, setCopied] = useState(false)
  const link = buildReferralLink()

  const share = () => {
    hapticTap()
    const text = t('share.text')
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`)
  }

  const copy = async () => {
    hapticSelect()
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard недоступен */
    }
  }

  return (
    <div className="mx-4 mt-4">
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('profile.invite_friends')}</span>
        {count !== null && (
          <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">{t('profile.invited', { n: count })}</span>
        )}
      </div>
      <div className="card p-3">
        <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
          {t('profile.invite_text')}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={share}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white active:scale-[0.99]"
          >
            <Send size={18} strokeWidth={2} />
            {t('profile.share')}
          </button>
          <button
            onClick={copy}
            className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm font-bold text-ink-muted active:scale-[0.99]"
          >
            {copied ? t('profile.copied') : t('profile.copy')}
          </button>
        </div>

        {friends.length > 0 && (
          <div className="mt-3 border-t border-surface-sunken pt-3">
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
              {t('profile.who_joined')}
            </div>
            <div className="flex flex-col gap-1.5">
              {friends.map((f) => (
                <div key={f.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-sunken/50 px-2.5 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    {(f.name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{f.name}</div>
                    {f.username && <div className="truncate text-[11px] text-ink-subtle">@{f.username}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                      +{REF_REWARD.xp} XP · <CoinAmount value={REF_REWARD.coins} size={10} />
                    </span>
                    <span className="text-[10px] text-ink-subtle">{dayjs(f.at).fromNow()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
