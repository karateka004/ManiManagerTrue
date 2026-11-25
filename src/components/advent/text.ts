/**
 * Тексты адвента и праздничного «Прогресса» (ru/en) — ленивым чанком вкладки,
 * не в общем словаре: тот целиком в стартовом. Как components/analytics/text.ts.
 */
import { useStore } from '../../store/transactions'
import type { Lang } from '../../lib/i18n'

const RU = {
  'hub.kicker': 'С наступающим!',
  'hub.kicker_ny': 'С Новым годом!',
  'hub.countdown': 'Новый год через {n} дн.',
  'hub.countdown_today': 'Новый год этой ночью',
  'hub.countdown_short': '{n}\u00A0дн.',

  'tile.title': 'Адвент',
  'tile.waiting': 'Окошко {n} ждёт',
  'tile.opened': 'Открыто {n} из {total}',
  'tile.open': 'Открыть',

  'card.teaser_t': 'Новогодний адвент-календарь',
  'card.teaser_x': '31 окошко с подарками — по одному на каждый день декабря.',
  'card.teaser_in': 'через {n} {word}',
  'card.teaser_tomorrow': 'завтра',
  'card.final_t': 'Главный подарок ждёт',
  'card.final_x': 'Открыто {n} из {total} — забирай «Новогоднюю ночь» и титул.',
  'card.short_t': 'Адвент: открыто {n} из {total}',
  'card.short_x': 'До главного подарка — {left} {word}. Пропущенные можно открыть за монеты до 14 января.',
  'card.done_t': 'Адвент собран',
  'card.done_x': 'Главный подарок получен. С Новым годом!',

  'screen.kicker': 'Новый год {year}',
  'screen.title': 'Адвент-календарь',
  'hero.days': 'до Нового года',
  'hero.tonight': 'Новый год — этой ночью',
  'hero.teaser': 'Первое окошко откроется 1 декабря',
  'hero.ny': 'С Новым годом!',
  'hero.progress': 'Открыто {n} из {total}',
  'hero.need': 'главный подарок — от {need}',
  'hero.streak': 'Окошко дня засчитывает серию: {n} {word} подряд',
  'hero.streak_none': 'Окошко дня засчитывает и день серии',

  'door.today': 'сегодня',
  'door.sr_open': '{date}: открыто',
  'door.sr_today': '{date}: окошко дня, открыть',
  'door.sr_missed': '{date}: пропущено, открыть за {price} монет',
  'door.sr_locked': '{date}: откроется в свой день',
  'door.locked_toast': 'Откроется {date}',
  'door.teaser_toast': 'Окошки откроются с 1 декабря',

  'final.title': 'Главный подарок',
  'final.locked': 'Откроется 1 января — нужно {need} {word} из {total}, открыто {n}.',
  'final.short': 'Не хватает {left} {word} — пропущенные можно открыть за монеты до 14 января.',
  'final.ready': 'Открыто {n} из {total} — можно забирать!',
  'final.open': 'Открыть подарок',
  'final.got': 'Получено: «Новогодняя ночь» и «Новогодний дух»',

  'rules': 'Окошко дня открывается бесплатно и засчитывается в серию. Пропущенное — позже, за {price} монет, до 14 января. Главный подарок 1 января — за {need} {word} из {total}.',

  'coll.title': 'Новогодняя коллекция',
  'coll.day': 'Окошко {day}',
  'coll.final': 'Главный подарок',
  'coll.footer': 'Вещи коллекции — только в адвенте: в Магазине их не купить.',

  'sheet.title': '{date}',
  'sheet.final_title': 'С Новым годом!',
  'sheet.tip': 'Совет дня',
  'sheet.done': 'Готово',
  'sheet.coins': '+{n} {word}',
  'sheet.xp': '+{n} XP',
  'sheet.streak': 'Серия {n} {word}',
  'sheet.streak_gift': 'Подарок за серию — «{name}»',
  'sheet.dup': 'Эта вещь у тебя уже была — вместо неё {n} монет',
  'sheet.wear': 'Надеть',
  'sheet.worn': 'Надето',
  'sheet.late_t': 'Пропущенное окошко',
  'sheet.late_x': '{date} — откроется за {price} монет. Подарок внутри, день серии — нет.',
  'sheet.late_inside': 'Внутри: «{name}»',
  'sheet.late_btn': 'Открыть за {price}',
  'sheet.late_short': 'Не хватает {n} {word}',

  'act.add': 'Записать трату',
  'act.limits': 'Поставить лимиты',
  'act.budget': 'Задать бюджет',
  'act.goals': 'Создать цель',
  'act.ask': 'Спросить Кошель',

  'shop.title': 'Новогодняя коллекция',
  'shop.hint': 'Собрано {n} из {total}. Вещи коллекции — только из окошек адвент-календаря на «Прогрессе».',
  'shop.badge': 'Адвент',
  'shop.only': 'Только из адвент-календаря',
} as const

type Key = keyof typeof RU

const EN: Record<Key, string> = {
  'hub.kicker': 'Happy holidays!',
  'hub.kicker_ny': 'Happy New Year!',
  'hub.countdown': 'New Year in {n} d',
  'hub.countdown_today': 'New Year is tonight',
  'hub.countdown_short': '{n}\u00A0d',

  'tile.title': 'Advent',
  'tile.waiting': 'Window {n} is waiting',
  'tile.opened': '{n} of {total} opened',
  'tile.open': 'Open',

  'card.teaser_t': 'New Year advent calendar',
  'card.teaser_x': '31 windows with gifts — one for every day of December.',
  'card.teaser_in': 'in {n} {word}',
  'card.teaser_tomorrow': 'tomorrow',
  'card.final_t': 'The grand prize is waiting',
  'card.final_x': '{n} of {total} opened — claim “New Year night” and the title.',
  'card.short_t': 'Advent: {n} of {total} opened',
  'card.short_x': '{left} more {word} to the grand prize. Missed ones can be opened for coins until January 14.',
  'card.done_t': 'Advent complete',
  'card.done_x': 'Grand prize claimed. Happy New Year!',

  'screen.kicker': 'New Year {year}',
  'screen.title': 'Advent calendar',
  'hero.days': 'to New Year',
  'hero.tonight': 'New Year is tonight',
  'hero.teaser': 'The first window opens on December 1',
  'hero.ny': 'Happy New Year!',
  'hero.progress': '{n} of {total} opened',
  'hero.need': 'grand prize from {need}',
  'hero.streak': 'Today’s window counts toward your streak: {n} {word} in a row',
  'hero.streak_none': 'Today’s window also counts as a streak day',

  'door.today': 'today',
  'door.sr_open': '{date}: opened',
  'door.sr_today': '{date}: today’s window, open',
  'door.sr_missed': '{date}: missed, open for {price} coins',
  'door.sr_locked': '{date}: opens on its day',
  'door.locked_toast': 'Opens on {date}',
  'door.teaser_toast': 'Windows open from December 1',

  'final.title': 'Grand prize',
  'final.locked': 'Opens on January 1 — needs {need} of {total} {word}, opened so far: {n}.',
  'final.short': '{left} more {word} needed — missed ones can be opened for coins until January 14.',
  'final.ready': '{n} of {total} opened — it’s yours!',
  'final.open': 'Open the gift',
  'final.got': 'Received: “New Year night” and “Holiday spirit”',

  'rules': 'Today’s window opens for free and counts as a streak day. A missed one can be opened later for {price} coins, until January 14. The grand prize opens on January 1 for {need} of {total} {word}.',

  'coll.title': 'New Year collection',
  'coll.day': 'Window {day}',
  'coll.final': 'Grand prize',
  'coll.footer': 'Collection items come only from the advent — the Shop doesn’t sell them.',

  'sheet.title': '{date}',
  'sheet.final_title': 'Happy New Year!',
  'sheet.tip': 'Tip of the day',
  'sheet.done': 'Done',
  'sheet.coins': '+{n} {word}',
  'sheet.xp': '+{n} XP',
  'sheet.streak': 'Streak {n} {word}',
  'sheet.streak_gift': 'Streak gift — “{name}”',
  'sheet.dup': 'You already had this item — {n} coins instead',
  'sheet.wear': 'Wear',
  'sheet.worn': 'Worn',
  'sheet.late_t': 'Missed window',
  'sheet.late_x': '{date} — opens for {price} coins. The gift is inside, the streak day isn’t.',
  'sheet.late_inside': 'Inside: “{name}”',
  'sheet.late_btn': 'Open for {price}',
  'sheet.late_short': '{n} {word} short',

  'act.add': 'Add an expense',
  'act.limits': 'Set limits',
  'act.budget': 'Set a budget',
  'act.goals': 'Create a goal',
  'act.ask': 'Ask Koshel',

  'shop.title': 'New Year collection',
  'shop.hint': '{n} of {total} collected. These items come only from the advent calendar windows on Progress.',
  'shop.badge': 'Advent',
  'shop.only': 'Advent calendar only',
}

export type AdventT = (key: Key, vars?: Record<string, string | number>) => string

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function adventT(lang: Lang): AdventT {
  const dict = lang === 'en' ? EN : RU
  return (key, vars) => interpolate(dict[key] ?? RU[key], vars)
}

export function useAdventT(): AdventT {
  const lang = useStore((s) => s.lang)
  return adventT(lang)
}

/** «окошко / окошка / окошек» (en: window / windows). */
export function windowsWord(lang: Lang, n: number): string {
  if (lang === 'en') return n === 1 ? 'window' : 'windows'
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'окошко'
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'окошка'
  return 'окошек'
}
