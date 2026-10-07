/**
 * Сутки по Москве и маска дней активности.
 *
 * ЗАЧЕМ МАСКА
 *
 * До неё про человека было известно два момента: когда он пришёл и когда был в
 * последний раз. Из двух точек нельзя честно ответить на главный вопрос
 * аналитики — «вернулся ли человек на следующий день». Дашборд считал «зашёл ещё
 * в какой-то другой день», а это заметно добрее настоящего D1 и ничего не
 * говорит про седьмой и тридцатый день.
 *
 * Журнал всех заходов хранить негде: отдельная запись KV на каждый визит — это
 * тысячи записей в сутки после рассылки. Зато своя карточка рейтинга (`lb:<id>`)
 * и так переписывается при первом за сутки запуске, а очередь бота (`inbox:<id>`)
 * — при каждой записи. В них и кладём 64 бита: бит 0 — день последней
 * активности `d`, бит i — день `d - i`. Новых записей в KV это не добавляет.
 *
 * Окно — 64 дня: этого хватает на D1…D30 любой свежей когорты и на месяц
 * активности любого человека. Что старше окна, маска не знает и честно отвечает
 * «неизвестно», а не «не заходил».
 */

/** Сдвиг МСК от UTC (у МСК нет перехода на летнее время). */
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
export const DAY_MS = 86_400_000

/** Номер суток по МСК: 0 — 1 января 1970 года по Москве. */
export function mskDay(ms: number): number {
  return Math.floor((ms + MSK_OFFSET_MS) / DAY_MS)
}

/** Начало суток по МСК в epoch ms. */
export function mskDayStart(day: number): number {
  return day * DAY_MS - MSK_OFFSET_MS
}

export function startOfTodayMskMs(nowMs: number): number {
  return mskDayStart(mskDay(nowMs))
}

/** Строка даты YYYY-MM-DD по МСК. */
export function mskDateStr(ms: number): string {
  const d = new Date(ms + MSK_OFFSET_MS)
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}`
}

/** Час по МСК (0–23). */
export function mskHour(ms: number): number {
  return Math.floor((ms + MSK_OFFSET_MS) / 3_600_000) % 24
}

/* ---------- Маска дней ---------- */

/** Ширина окна маски в днях. */
export const MASK_DAYS = 64

const ZERO = BigInt(0)
const ONE = BigInt(1)
const FULL = (ONE << BigInt(MASK_DAYS)) - ONE

/** Маска в хранилище: шестнадцатеричная строка и день бита 0. */
export interface DayMask {
  /** Биты активности, hex без ведущих нулей. */
  m: string
  /** День бита 0 (номер суток МСК) — последний отмеченный день. */
  d: number
}

function bits(m: string | undefined): bigint {
  // Недоверенная строка из хранилища: всё, что не похоже на маску, считаем пустым.
  if (!m || !/^[0-9a-f]{1,16}$/.test(m)) return ZERO
  return BigInt('0x' + m)
}

/** Валидная ли маска (поля на месте и правильного вида). */
export function isMask(x: unknown): x is DayMask {
  const v = x as DayMask | null
  return !!v && typeof v.m === 'string' && /^[0-9a-f]{1,16}$/.test(v.m) && Number.isInteger(v.d) && v.d > 0
}

/**
 * Отметить день активности. Возвращает новую маску; исходную не трогает.
 *
 * День позже последнего — сдвигаем окно; день внутри окна (часы на устройстве
 * сбиты, запоздалая запись) — просто ставим его бит; день раньше окна — некуда,
 * маска остаётся прежней.
 */
export function markDay(prev: { m?: string; d?: number } | undefined, day: number): DayMask {
  const hasPrev = !!prev && typeof prev.d === 'number' && Number.isInteger(prev.d)
  let b = hasPrev ? bits(prev!.m) : ZERO
  const at = hasPrev ? (prev!.d as number) : day
  if (day > at) {
    const shift = day - at
    b = shift >= MASK_DAYS ? ZERO : (b << BigInt(shift)) & FULL
    return { m: (b | ONE).toString(16), d: day }
  }
  const back = at - day
  if (back < MASK_DAYS) b |= ONE << BigInt(back)
  return { m: b.toString(16), d: at }
}

/**
 * Отмеченные дни по возрастанию.
 *
 * Разбираем по шестнадцатеричным цифрам обычными числами, а не BigInt: функция
 * зовётся для каждого человека при каждой сборке дашборда, и сдвиги BigInt по
 * одному биту съедали большую часть процессорного времени запроса.
 */
export function maskDays(mask: DayMask | undefined): number[] {
  if (!mask || !isMask(mask)) return []
  const m = mask.m
  const out: number[] = []
  for (let ci = 0; ci < m.length; ci++) {
    const nib = parseInt(m[m.length - 1 - ci], 16)
    if (!nib) continue
    for (let b = 0; b < 4; b++) if (nib & (1 << b)) out.push(mask.d - (ci * 4 + b))
  }
  return out.reverse()
}

/** Первый день, о котором маска знает правду (раньше — за краем окна). */
export function maskWindowStart(mask: DayMask): number {
  return mask.d - (MASK_DAYS - 1)
}
