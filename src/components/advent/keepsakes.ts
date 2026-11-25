/**
 * Игрушка окошка: у каждого дня декабря своя — в коллекцию на ёлку. Получить её
 * = открыть окошко (своего поля в сторе нет: коллекция — это открытые окошки).
 * Рисунки — Keepsake.tsx, по форме `shape`. Тексты здесь же (ru/en), ленивым
 * чанком календаря, не в общем словаре.
 *
 * Классические игрушки с советской ёлки (шишка, сосулька, часы, ракета, мухомор)
 * вперемешку с «денежными» (копилка, монетка, сундучок, слиток, сам Кошель):
 * узнаваемо и про наше приложение. Подпись — тёплая, с намёком на привычку.
 */
export type KeepsakeShape =
  | 'cone'
  | 'icicle'
  | 'bullfinch'
  | 'tangerine'
  | 'mitten'
  | 'bell'
  | 'piggy'
  | 'ball'
  | 'owl'
  | 'house'
  | 'star'
  | 'gingerbread'
  | 'stocking'
  | 'clock'
  | 'coin'
  | 'deer'
  | 'mushroom'
  | 'lantern'
  | 'squirrel'
  | 'snowman'
  | 'wallet'
  | 'candy'
  | 'gift'
  | 'snowflake'
  | 'chest'
  | 'goldbar'
  | 'cocoa'
  | 'rocket'
  | 'moon'
  | 'tree'
  | 'topper'

export interface KeepsakeDef {
  day: number
  shape: KeepsakeShape
  ru: { name: string; note: string }
  en: { name: string; note: string }
}

export const KEEPSAKES: KeepsakeDef[] = [
  { day: 1, shape: 'cone', ru: { name: 'Шишка', note: 'Первая на ёлке. С малого начинаются большие запасы.' }, en: { name: 'Pine cone', note: 'First on the tree. Big savings start small.' } },
  { day: 2, shape: 'icicle', ru: { name: 'Сосулька', note: 'Холодная голова\u00A0— главное правило декабрьских покупок.' }, en: { name: 'Icicle', note: 'Keep a cool head\u00A0— rule one of December shopping.' } },
  { day: 3, shape: 'bullfinch', ru: { name: 'Снегирь', note: 'Зимний гость, который знает цену каждому зёрнышку.' }, en: { name: 'Bullfinch', note: 'A winter guest who knows the value of every seed.' } },
  { day: 4, shape: 'tangerine', ru: { name: 'Мандарин', note: 'Пахнет праздником, стоит копейки, радует сильно.' }, en: { name: 'Tangerine', note: 'Smells like the holidays, costs little, brings lots of joy.' } },
  { day: 5, shape: 'mitten', ru: { name: 'Варежка', note: 'Тёплая и парная\u00A0— как привычка записывать траты.' }, en: { name: 'Mitten', note: 'Warm and paired\u00A0— like the habit of logging spending.' } },
  { day: 6, shape: 'bell', ru: { name: 'Колокольчик', note: 'Звенит, когда лимит близко. Прислушайся.' }, en: { name: 'Bell', note: 'It rings when a limit is near. Listen.' } },
  { day: 7, shape: 'piggy', ru: { name: 'Копилка', note: 'Хрю! Каждая отложенная монета\u00A0— ей на ужин.' }, en: { name: 'Piggy bank', note: 'Oink! Every coin you save is her dinner.' } },
  { day: 8, shape: 'ball', ru: { name: 'Расписной шар', note: 'Классика, которая не выходит из моды. Как бюджет.' }, en: { name: 'Painted bauble', note: 'A classic that never goes out of style. Like a budget.' } },
  { day: 9, shape: 'owl', ru: { name: 'Сова', note: 'Совиная мудрость: ночные покупки подождут до утра.' }, en: { name: 'Owl', note: 'Owl wisdom: late-night purchases can wait till morning.' } },
  { day: 10, shape: 'house', ru: { name: 'Домик', note: 'Свой угол\u00A0— цель, ради которой стоит копить.' }, en: { name: 'Little house', note: 'A place of your own\u00A0— a goal worth saving for.' } },
  { day: 11, shape: 'star', ru: { name: 'Звёздочка', note: 'Путеводная: поставь цель\u00A0— и иди к ней.' }, en: { name: 'Little star', note: 'A guiding star: set a goal and follow it.' } },
  { day: 12, shape: 'gingerbread', ru: { name: 'Пряник', note: 'Сладкий, но в меру. Как праздничный бюджет.' }, en: { name: 'Gingerbread', note: 'Sweet, but in moderation. Like a holiday budget.' } },
  { day: 13, shape: 'stocking', ru: { name: 'Носок', note: 'Для подарков… и для маленькой заначки.' }, en: { name: 'Stocking', note: 'For presents… and a little stash.' } },
  { day: 14, shape: 'clock', ru: { name: 'Часы', note: 'Без пяти двенадцать\u00A0— самое время подвести итоги.' }, en: { name: 'Clock', note: 'Five to midnight\u00A0— time to sum up the year.' } },
  { day: 15, shape: 'coin', ru: { name: 'Монетка', note: 'Монета к монете\u00A0— и вот уже подарок.' }, en: { name: 'Coin', note: 'Coin by coin\u00A0— and there’s a gift.' } },
  { day: 16, shape: 'deer', ru: { name: 'Олень', note: 'Тянет сани и никогда не берёт лишнего.' }, en: { name: 'Reindeer', note: 'Pulls the sleigh and never takes more than needed.' } },
  { day: 17, shape: 'mushroom', ru: { name: 'Мухомор', note: 'Красивый. Но не всё красивое нужно покупать.' }, en: { name: 'Toadstool', note: 'Pretty. But not every pretty thing needs buying.' } },
  { day: 18, shape: 'lantern', ru: { name: 'Фонарик', note: 'Светит к цели в самые тёмные дни.' }, en: { name: 'Lantern', note: 'Lights the way to your goal on the darkest days.' } },
  { day: 19, shape: 'squirrel', ru: { name: 'Белочка', note: 'Главная по запасам. Учимся у лучших.' }, en: { name: 'Squirrel', note: 'Chief of stockpiles. Learn from the best.' } },
  { day: 20, shape: 'snowman', ru: { name: 'Снеговик', note: 'Не тает перед соблазнами.' }, en: { name: 'Snowman', note: 'Doesn’t melt in the face of temptation.' } },
  { day: 21, shape: 'wallet', ru: { name: 'Кошель', note: 'Это я! Спасибо, что ведёшь учёт вместе со мной.' }, en: { name: 'Koshel', note: 'It’s me! Thanks for keeping track together.' } },
  { day: 22, shape: 'candy', ru: { name: 'Леденец', note: 'Полосатая награда за дисциплину.' }, en: { name: 'Candy cane', note: 'A striped reward for discipline.' } },
  { day: 23, shape: 'gift', ru: { name: 'Подарок', note: 'Самый приятный\u00A0— купленный без долгов.' }, en: { name: 'Present', note: 'The best one is bought without debt.' } },
  { day: 24, shape: 'snowflake', ru: { name: 'Снежинка', note: 'Двух одинаковых не бывает\u00A0— как и твоих целей.' }, en: { name: 'Snowflake', note: 'No two alike\u00A0— just like your goals.' } },
  { day: 25, shape: 'chest', ru: { name: 'Сундучок', note: 'Маленький сундук для больших накоплений.' }, en: { name: 'Chest', note: 'A small chest for big savings.' } },
  { day: 26, shape: 'goldbar', ru: { name: 'Слиток', note: 'Надёжный, как подушка безопасности.' }, en: { name: 'Gold bar', note: 'Solid as an emergency fund.' } },
  { day: 27, shape: 'cocoa', ru: { name: 'Какао', note: 'Иногда лучшая трата\u00A0— тёплый вечер дома.' }, en: { name: 'Cocoa', note: 'Sometimes the best spend is a cozy night in.' } },
  { day: 28, shape: 'rocket', ru: { name: 'Ракета', note: 'К новым целям\u00A0— на всех парах!' }, en: { name: 'Rocket', note: 'Full speed toward new goals!' } },
  { day: 29, shape: 'moon', ru: { name: 'Месяц', note: 'Месяц закончится, а привычка останется.' }, en: { name: 'Crescent moon', note: 'The month ends, the habit stays.' } },
  { day: 30, shape: 'tree', ru: { name: 'Ёлочка', note: 'Ёлка на ёлке: праздник в празднике.' }, en: { name: 'Little tree', note: 'A tree on the tree: a celebration within a celebration.' } },
  { day: 31, shape: 'topper', ru: { name: 'Звезда', note: 'Венчает ёлку и год. Ты молодец!' }, en: { name: 'Tree topper', note: 'Crowns the tree and the year. Well done!' } },
]

export const keepsakeOf = (day: number): KeepsakeDef | undefined => KEEPSAKES[day - 1]
