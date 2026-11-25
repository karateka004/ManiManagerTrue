/**
 * Советы дня адвент-календаря (ru/en): по одному на окошко и один — главному
 * подарку. Ленивый чанк экрана адвента: в общий словарь (стартовый чанк) не
 * кладём. Действие под советом — в lib/advent.ts (ADVENT_DOORS[].action),
 * вопрос ассистенту — здесь же (`ask`).
 *
 * Тон — дружеский, без нравоучений и без выдуманной статистики: только то,
 * что правда для любого, кто считает деньги в праздники.
 */
import type { Lang } from '../../lib/i18n'

export interface AdventTip {
  ru: string
  en: string
  /** Вопрос ассистенту для действия 'ask'. */
  ask?: { ru: string; en: string }
}

export const ADVENT_TIPS: Record<number, AdventTip> = {
  1: {
    ru: 'Составь список подарков и напиши сумму напротив каждого. Итог — твой лимит на «Подарки» в декабре.',
    en: 'List everyone you’re buying for and put a price next to each name. The total is your December limit for Gifts.',
  },
  2: {
    ru: 'Записывай траты в день покупки — через неделю половину уже не вспомнить. Одна фраза боту — и готово.',
    en: 'Log spending the day you buy — a week later you’ll have forgotten half of it. One message to the bot does it.',
  },
  3: {
    ru: 'Скидка — не повод купить. Перед оплатой спроси себя: взял бы ты это за полную цену?',
    en: 'A discount isn’t a reason to buy. Before paying, ask yourself: would I take this at full price?',
  },
  4: {
    ru: 'Дорогой подарок — не обязательно лучший. Время вместе, открытка от руки и внимание запоминаются дольше.',
    en: 'The priciest gift isn’t always the best. Time together, a handwritten card and attention are remembered longer.',
  },
  5: {
    ru: 'Задай бюджет месяца: Кошель покажет, сколько можно тратить в день, чтобы праздники не съели январь.',
    en: 'Set a monthly budget: Koshel will show how much you can spend per day so the holidays don’t eat January.',
  },
  6: {
    ru: 'Отложи «январскую подушку»: аренда и счета после праздников никуда не денутся. Даже небольшая цель уже помогает.',
    en: 'Put aside a January cushion: rent and bills don’t take a holiday. Even a small goal helps.',
  },
  7: {
    ru: 'Продукты к праздничному столу лучше купить заранее: 31-го вечером очереди длиннее, а выбор меньше.',
    en: 'Buy groceries for the holiday table early: on the evening of the 31st the queues are longer and the choice is smaller.',
  },
  8: {
    ru: 'Скинуться с друзьями на один большой подарок — дешевле и приятнее, чем пять мелочей.',
    en: 'Chipping in with friends for one big gift costs less and means more than five small ones.',
  },
  9: {
    ru: 'Корпоратив или встреча с друзьями? Реши заранее, сколько готов потратить за вечер, — и держись этой суммы.',
    en: 'Office party or a night out? Decide in advance how much you’re ready to spend — and stick to it.',
  },
  10: {
    ru: 'Привычка дня: запиши сегодня хотя бы одну трату. Маленький ритуал, который к концу года экономит больше всего.',
    en: 'Habit of the day: log at least one expense today. A tiny ritual that saves the most by the end of the year.',
  },
  11: {
    ru: 'Проверь подписки: сервисы, которыми не пользуешься, тихо списывают деньги каждый месяц.',
    en: 'Check your subscriptions: services you don’t use quietly charge you every month.',
    ask: { ru: 'Какие у меня регулярные платежи?', en: 'What are my recurring payments?' },
  },
  12: {
    ru: 'Кэшбэк и бонусы — тоже деньги. Записывай их как доход, чтобы видеть, сколько они дают за год.',
    en: 'Cashback and bonuses are money too. Log them as income to see what they add up to over a year.',
  },
  13: {
    ru: 'Не бери кредит на праздники: январь, начатый с долга, тянется очень долго.',
    en: 'Don’t borrow for the holidays: a January that starts in debt feels very long.',
  },
  14: {
    ru: 'Середина декабря — время сверить курс. Спроси Кошель, на что ушло больше всего.',
    en: 'Mid-December is a good time to check your course. Ask Koshel where most of the money went.',
    ask: { ru: 'На что больше всего ушло в этом месяце?', en: 'What did I spend the most on this month?' },
  },
  15: {
    ru: 'Подарок себе — это нормально, если он в бюджете. Запланируй его заранее, а не покупай на эмоциях.',
    en: 'A gift to yourself is fine if it fits the budget. Plan it ahead instead of buying on impulse.',
  },
  16: {
    ru: 'Покупки по списку спасают от импульсивных трат — а соблазнов в декабре больше всего.',
    en: 'Shopping from a list saves you from impulse buys — and December has the most temptations.',
  },
  17: {
    ru: 'Подарки-впечатления — билеты, мастер-класс, поездка — это меньше вещей и больше воспоминаний.',
    en: 'Experience gifts — tickets, a workshop, a trip — mean fewer things and more memories.',
  },
  18: {
    ru: 'Загляни в «Аналитику»: какая категория в декабре растёт быстрее обычного? Подсказки покажут сами.',
    en: 'Look at Analytics: which category is growing faster than usual this December? The insights will tell you.',
  },
  19: {
    ru: 'Поездка на праздники? Заведи цель и откладывай понемногу каждую неделю — так она не ударит по бюджету.',
    en: 'Holiday trip coming? Create a goal and save a little every week so it won’t hit your budget.',
  },
  20: {
    ru: 'До Нового года меньше двух недель — самое время проверить лимиты по категориям.',
    en: 'Less than two weeks to New Year — a good moment to check your category limits.',
  },
  21: {
    ru: 'Упаковка тоже стоит денег. Коробки, ткань и красивые пакеты из дома — и подарок выглядит не хуже.',
    en: 'Wrapping costs money too. Boxes, fabric and nice bags from home make a gift look just as good.',
  },
  22: {
    ru: 'Ёлочные игрушки и украшения дешевле всего сразу после праздников — запомни это на следующий год.',
    en: 'Ornaments and decorations are cheapest right after the holidays — remember that for next year.',
  },
  23: {
    ru: 'Оплати счета до праздников: в суматохе их легко забыть, а пени никто не отменял.',
    en: 'Pay your bills before the holidays: they’re easy to forget in the rush, and late fees still apply.',
  },
  24: {
    ru: 'Скинулись на общий стол или подарок? Запиши свою долю — это тоже трата.',
    en: 'Chipped in for a shared table or gift? Log your share — it’s spending too.',
  },
  25: {
    ru: 'Рождественские распродажи манят, но лучший подарок себе в январе — отсутствие долгов.',
    en: 'Christmas sales are tempting, but the best gift for your January self is having no debt.',
  },
  26: {
    ru: 'Подведи итоги года: спроси Кошель, сколько ушло за год и на что.',
    en: 'Review your year: ask Koshel how much you spent this year and on what.',
    ask: { ru: 'Сколько я потратил в этом году и на что?', en: 'How much did I spend this year and on what?' },
  },
  27: {
    ru: 'Цель на следующий год: даже небольшая сумма каждый месяц к декабрю превращается в заметную.',
    en: 'A goal for next year: even a small amount every month becomes a noticeable sum by December.',
  },
  28: {
    ru: 'Конверты с наличными на праздники: опустел конверт — праздничный бюджет закончился. Старый способ, который работает.',
    en: 'Cash envelopes for the holidays: when the envelope is empty, the holiday budget is done. Old-school, but it works.',
  },
  29: {
    ru: 'Подумай о январе заранее: абонементы, страховки, дни рождения. Общий бюджет месяца поможет не уйти в минус.',
    en: 'Think about January ahead: memberships, insurance, birthdays. A monthly budget keeps you out of the red.',
  },
  30: {
    ru: 'Последние покупки года — тоже траты. Запиши их, и итог года будет честным.',
    en: 'The last purchases of the year are spending too. Log them, and your year in review will be honest.',
  },
  31: {
    ru: 'С наступающим! Год, в котором деньги под контролем, — уже подарок. А завтра откроется главный подарок адвента.',
    en: 'Happy New Year’s Eve! A year with your money under control is a gift already. Tomorrow the advent’s grand prize opens.',
  },
}

export const FINAL_TIP: AdventTip = {
  ru: 'С Новым годом! Пусть деньги приходят чаще, чем уходят.',
  en: 'Happy New Year! May money come in more often than it goes out.',
}

export const tipText = (tip: AdventTip, lang: Lang): string => (lang === 'en' ? tip.en : tip.ru)
