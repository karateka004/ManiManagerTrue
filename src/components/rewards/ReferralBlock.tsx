import { useState, type ReactNode } from 'react'
import { Send } from 'lucide-react'
import { buildReferralLink, type ReferralFriend } from '../../lib/api'
import { REF_REWARD } from '../../store/transactions'
import { openTelegramLink, hapticTap, hapticSelect } from '../../lib/telegram'
import { dayjs } from '../../lib/format'
import type { TFunc } from '../../lib/i18n'
import { Group, Row } from '../ui/Group'

/**
 * Друзья: задания за приглашения, ссылка и список присоединившихся — одной
 * группой.
 *
 * 2.0: раньше это были два раздела подряд — «Спешел» с тремя карточками
 * заданий и «Пригласить друзей» с кнопками. По сути одно и то же действие,
 * разнесённое на два заголовка, причём «Спешел» не объяснял, что внутри.
 * Задания приходят сюда готовыми строками (`quests`), чтобы логика борда
 * осталась на странице.
 */
export function ReferralBlock({
  count,
  friends,
  quests,
  t,
}: {
  count: number | null
  friends: ReferralFriend[]
  quests: ReactNode
  t: TFunc
}) {
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
    <Group
      className="mx-4 mt-6"
      title={t('profile.invite_friends')}
      action={count !== null && count > 0 ? t('profile.invited', { n: count }) : undefined}
    >
      {quests}

      <div className="row">
        <div className="row-main flex-col items-stretch gap-3">
          <p className="caption leading-snug text-ink-muted">{t('profile.invite_text')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={share}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.98]"
            >
              <Send size={16} strokeWidth={2.2} />
              {t('profile.share')}
            </button>
            <button
              type="button"
              onClick={copy}
              className="rounded-full bg-surface-sunken px-4 py-2.5 text-[14px] font-bold text-ink transition-transform active:scale-[0.98]"
            >
              {copied ? t('profile.copied') : t('profile.copy')}
            </button>
          </div>
        </div>
      </div>

      {friends.map((f) => (
        <Row
          key={f.id}
          lead={
            <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[14px] font-bold text-ink-muted">
              {(f.name?.[0] ?? '?').toUpperCase()}
            </span>
          }
          title={f.name}
          subtitle={f.username ? '@' + f.username : undefined}
          value={<span className="text-ink-muted">+{REF_REWARD.xp} XP</span>}
          valueSub={dayjs(f.at).fromNow()}
        />
      ))}
    </Group>
  )
}
