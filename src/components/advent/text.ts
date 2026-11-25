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
  'card.teaser_x': '31 окошко с подарками\u00A0— по одному на каждый день декабря.',
  'card.teaser_in': 'через {n} {word}',
  'card.teaser_tomorrow': 'завтра',
  'card.final_t': 'Главный подарок ждёт',
  'card.final_x': 'Открыто {n} из {total}\u00A0— забирай «Новогоднюю ночь» и титул.',
  'card.short_t': 'Адвент: открыто {n} из {total}',
  'card.short_x': 'До главного подарка\u00A0— {left} {word}. Пропущенные можно открыть за монеты до 14 января.',
  'card.done_t': 'Адвент собран',
  'card.done_x': 'Главный подарок получен. С Новым годом!',

  'screen.kicker': 'Новый год {year}',
  'screen.title': 'Адвент-календарь',
  'hero.days': 'до Нового года',
  'hero.tonight': 'Новый год\u00A0— этой ночью',
  'hero.teaser': 'Первое окошко откроется 1 декабря',
  'hero.ny': 'С Новым годом!',
  'hero.progress': 'Открыто {n} из {total}',
  'hero.need': 'главный подарок\u00A0— от {need}',
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
  'final.locked': 'Откроется 1 января\u00A0— нужно {need} {word} из {total}, открыто {n}.',
  'final.short': 'Не хватает {left} {word}\u00A0— пропущенные можно открыть за монеты до 14 января.',
  'final.ready': 'Открыто {n} из {total}\u00A0— можно забирать!',
  'final.open': 'Открыть подарок',
  'final.got': 'Получено: «Новогодняя ночь» и «Новогодний дух»',

  'rules': 'Окошко дня открывается бесплатно и засчитывается в серию. Пропущенное\u00A0— позже, за {price} монет, до 14 января. Главный подарок 1 января\u00A0— за {need} {word} из {total}.',

  'coll.title': 'Новогодняя коллекция',
  'coll.day': 'Окошко {day}',
  'coll.final': 'Главный подарок',
  'coll.footer': 'Вещи коллекции\u00A0— только в адвенте: в Магазине их не купить.',

  'sheet.title': '{date}',
  'sheet.final_title': 'С Новым годом!',
  'sheet.tip': 'Совет дня',
  'sheet.done': 'Готово',
  'sheet.coins': '+{n} {word}',
  'sheet.xp': '+{n} XP',
  'sheet.streak': 'Серия {n} {word}',
  'sheet.streak_gift': 'Подарок за серию\u00A0— «{name}»',
  'sheet.dup': 'Эта вещь у тебя уже была\u00A0— вместо неё {n} монет',
  'sheet.wear': 'Надеть',
  'sheet.worn': 'Надето',
  'sheet.late_t': 'Пропущенное окошко',
  'sheet.late_x': '{date}\u00A0— откроется за {price} монет. Подарок внутри, день серии\u00A0— нет.',
  'sheet.late_inside': 'Внутри: «{name}»',
  'sheet.late_btn': 'Открыть за {price}',
  'sheet.late_short': 'Не хватает {n} {word}',

  'act.add': 'Записать трату',
  'act.limits': 'Поставить лимиты',
  'act.budget': 'Задать бюджет',
  'act.goals': 'Создать цель',
  'act.ask': 'Спросить Кошель',

  'shop.title': 'Новогодняя коллекция',
  'shop.hint': 'Собрано {n} из {total}. Вещи коллекции\u00A0— только из окошек адвент-календаря на «Прогрессе».',
  'shop.badge': 'Адвент',
  'shop.only': 'Только из адвент-календаря',

  'cal.kicker': 'Адвент-календарь',
  'cal.st_teaser': 'Первое окошко\u00A0— через {n} {word}',
  'cal.st_teaser_1': 'Первое окошко\u00A0— завтра',
  'cal.st_today': 'Окошко {day} декабря ждёт',
  'cal.st_opened': 'Открыто {n} из {total}',
  'cal.st_final': 'Главный подарок ждёт',
  'cal.st_short': 'До главного подарка\u00A0— {left} {word}',
  'cal.st_done': 'Адвент собран. С Новым годом!',
  'cal.rules': 'Как это работает',
  'cal.rule1': 'Каждый день декабря открывается окошко\u00A0— бесплатно. Оно засчитывает и день серии.',
  'cal.rule2': 'Пропустил\u00A0— открой позже за {price} монет, до 14 января. Подарок внутри, день серии\u00A0— нет.',
  'cal.rule3': 'В каждом окошке\u00A0— своя ёлочная игрушка, монеты и опыт. А ещё вещи коллекции, две заморозки серии (7 и 21), сундучки с вещью из магазина (13 и 27) и итоги года 31-го.',
  'cal.rule4': '1 января\u00A0— главный подарок, если открыто {need} {word} из {total}.',
  'cal.next_in': 'Следующее окошко\u00A0— через {time}',
  'cal.next_tomorrow': 'Следующее окошко\u00A0— завтра',
  'cal.tap_today': 'Окошко дня ждёт\u00A0— нажми на него',
  'cal.first_on': 'Окошки откроются 1 декабря',
  'cal.collected': 'Собрано {n} из {total}',
  'cal.final_btn': 'Открыть главный подарок',
  'cal.final_got': 'Главный подарок получен',
  'cal.final_need': 'Главный подарок\u00A0— 1 января, от {need} {word}',
  'cal.hours': '{h} ч {m} мин',
  'cal.minutes': '{m} мин',
  'rev.today': '{date} · окошко дня',
  'rev.opened': '{date} · открыто',
  'rev.late': '{date} · пропущено',
  'rev.close': 'Свернуть',
  'rev.got': 'Тебе подарок',
  'rev.also': 'А ещё',
  'gift.freeze': 'Заморозка серии',
  'gift.freeze_x': 'Пропустишь день\u00A0— серия не сгорит. Работает до 14 января.',
  'gift.frozen': 'Заморозка спасла серию\u00A0— пропуск не в счёт',
  'gift.frozen_n': 'Заморозки спасли серию\u00A0— {n} {word} пропуска не в счёт',
  'gift.chest': 'Из сундучка',
  'gift.chest_empty': 'В сундучке монеты\u00A0— все вещи этой редкости у тебя уже есть',
  'gift.freezes_left': 'Заморозок серии: {n}',
  'recap.title': 'Твой {year} в Кошеле',
  'recap.records': 'записей за год',
  'recap.days': 'дней с записями',
  'recap.best': 'рекорд серии',
  'recap.top': 'чаще всего',
  'recap.month': 'самый активный месяц',
  'tile.streak_wait': 'Продли окошком дня',
  'tile.streak_frozen': 'Серия заморожена',
  'tile.streak_none': 'Начни окошком дня',
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
  'card.teaser_x': '31 windows with gifts\u00A0— one for every day of December.',
  'card.teaser_in': 'in {n} {word}',
  'card.teaser_tomorrow': 'tomorrow',
  'card.final_t': 'The grand prize is waiting',
  'card.final_x': '{n} of {total} opened\u00A0— claim “New Year night” and the title.',
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
  'final.locked': 'Opens on January 1\u00A0— needs {need} of {total} {word}, opened so far: {n}.',
  'final.short': '{left} more {word} needed\u00A0— missed ones can be opened for coins until January 14.',
  'final.ready': '{n} of {total} opened\u00A0— it’s yours!',
  'final.open': 'Open the gift',
  'final.got': 'Received: “New Year night” and “Holiday spirit”',

  'rules': 'Today’s window opens for free and counts as a streak day. A missed one can be opened later for {price} coins, until January 14. The grand prize opens on January 1 for {need} of {total} {word}.',

  'coll.title': 'New Year collection',
  'coll.day': 'Window {day}',
  'coll.final': 'Grand prize',
  'coll.footer': 'Collection items come only from the advent\u00A0— the Shop doesn’t sell them.',

  'sheet.title': '{date}',
  'sheet.final_title': 'Happy New Year!',
  'sheet.tip': 'Tip of the day',
  'sheet.done': 'Done',
  'sheet.coins': '+{n} {word}',
  'sheet.xp': '+{n} XP',
  'sheet.streak': 'Streak {n} {word}',
  'sheet.streak_gift': 'Streak gift\u00A0— “{name}”',
  'sheet.dup': 'You already had this item\u00A0— {n} coins instead',
  'sheet.wear': 'Wear',
  'sheet.worn': 'Worn',
  'sheet.late_t': 'Missed window',
  'sheet.late_x': '{date}\u00A0— opens for {price} coins. The gift is inside, the streak day isn’t.',
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

  'cal.kicker': 'Advent calendar',
  'cal.st_teaser': 'First window in {n} {word}',
  'cal.st_teaser_1': 'First window tomorrow',
  'cal.st_today': 'December {day} window is waiting',
  'cal.st_opened': '{n} of {total} opened',
  'cal.st_final': 'The grand prize is waiting',
  'cal.st_short': '{left} more {word} to the grand prize',
  'cal.st_done': 'Advent complete. Happy New Year!',
  'cal.rules': 'How it works',
  'cal.rule1': 'A window opens every day of December\u00A0— for free. It also counts as a streak day.',
  'cal.rule2': 'Missed one? Open it later for {price} coins, until January 14. The gift is inside, the streak day isn’t.',
  'cal.rule3': 'Every window holds its own tree ornament, coins and XP. Plus collection items, two streak freezes (7 and 21), chests with a shop item (13 and 27) and your year in review on the 31st.',
  'cal.rule4': 'On January 1\u00A0— the grand prize, if {need} of {total} {word} are open.',
  'cal.next_in': 'Next window in {time}',
  'cal.next_tomorrow': 'Next window tomorrow',
  'cal.tap_today': 'Today’s window is waiting\u00A0— tap it',
  'cal.first_on': 'Windows open on December 1',
  'cal.collected': '{n} of {total} collected',
  'cal.final_btn': 'Open the grand prize',
  'cal.final_got': 'Grand prize received',
  'cal.final_need': 'Grand prize\u00A0— January 1, from {need} {word}',
  'cal.hours': '{h} h {m} min',
  'cal.minutes': '{m} min',
  'rev.today': '{date} · today’s window',
  'rev.opened': '{date} · opened',
  'rev.late': '{date} · missed',
  'rev.close': 'Collapse',
  'rev.got': 'A gift for you',
  'rev.also': 'Also',
  'gift.freeze': 'Streak freeze',
  'gift.freeze_x': 'Miss a day and your streak survives. Works until January 14.',
  'gift.frozen': 'A freeze saved your streak\u00A0— the missed day doesn’t count',
  'gift.frozen_n': 'Freezes saved your streak\u00A0— {n} missed {word} don’t count',
  'gift.chest': 'From the chest',
  'gift.chest_empty': 'Coins in the chest\u00A0— you already own every item of this rarity',
  'gift.freezes_left': 'Streak freezes: {n}',
  'recap.title': 'Your {year} in Koshel',
  'recap.records': 'records this year',
  'recap.days': 'days with records',
  'recap.best': 'best streak',
  'recap.top': 'most frequent',
  'recap.month': 'busiest month',
  'tile.streak_wait': 'Keep it with today’s window',
  'tile.streak_frozen': 'Streak on ice',
  'tile.streak_none': 'Start with today’s window',
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
