/** Обучение новичка: поиск целей, рамки вырезов и кольца, перетекание и место карточки. */
import { prefersReducedMotion } from '../../lib/fx'
import { at, type Spot, type StepDef } from './tourSteps'

/* ------------------------------------------------------------------ */
/* Цели и рамки. */

export interface Box {
  x: number
  y: number
  w: number
  h: number
  /** Радиус скругления. */
  r: number
}

export const HIDDEN_PANEL = '.tab-panel[data-off]'
export const found = new Map<string, HTMLElement>()
/**
 * Цель на экране: во вкладке — только в открытой (соседние отрисованы скрытыми,
 * и замер внутри них форсировал бы их расчёт), остальное — где есть.
 */
export function find(name: string): HTMLElement | null {
  const known = found.get(name)
  if (known && known.isConnected && !known.closest(HIDDEN_PANEL)) return known
  for (const e of document.querySelectorAll<HTMLElement>(at(name))) {
    if (!e.closest(HIDDEN_PANEL)) {
      found.set(name, e)
      return e
    }
  }
  found.delete(name)
  return null
}
export const isCurrent = (name: string) => find(name)?.getAttribute('aria-current') === 'page'
export const TABS = ['tab-home', 'tab-analytics', 'tab-rewards', 'tab-profile']

/** Цели внутри прокрутки — видимая часть обрезается её рамкой. */
export const CLIP: Record<string, string> = { categories: 'form' }

export const radii = new WeakMap<Element, number>()
export function radiusOf(e: Element, name: string, h: number): number {
  // Вкладки — пилюлей, как капсула выбранной вкладки.
  if (name.startsWith('tab-')) return h / 2
  let r = radii.get(e)
  if (r === undefined) {
    r = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0
    radii.set(e, r)
  }
  return r
}

/** Рамка цели, если она на экране. */
export function rectOf(name: string): Box | null {
  const e = find(name)
  if (!e) return null
  const b = e.getBoundingClientRect()
  let top = b.top
  let bottom = b.bottom
  const clip = CLIP[name] ? find(CLIP[name]) : null
  if (clip) {
    const c = clip.getBoundingClientRect()
    top = Math.max(top, c.top)
    bottom = Math.min(bottom, c.bottom)
  }
  if (b.width < 2 || bottom - top < 2 || bottom <= 0 || top >= innerHeight) return null
  return { x: b.left, y: top, w: b.width, h: bottom - top, r: radiusOf(e, name, bottom - top) }
}

export const PAD = 4
export const MAX_HOLES = 2
/** Перетекание выреза и кольца к новой цели, мс. */
export const DUR = 460
/** Пружина карточки: постоянная времени, мс. */
export const CARD_TAU = 80
/** Палец замер на сумме — значит, набрал; пора к категории. Назад к сумме — только если стёр её. */
export const SETTLE = 1000
/** Зазор между карточкой и целью (под хвостик). */
export const GAP = 12
export const EDGE = 10

export function spotRect(s: Spot, vw: number, vh: number): Box | null {
  let u: Box | null = null
  for (const n of s.names) {
    const r = rectOf(n)
    if (!r) continue
    if (!u) u = r
    else {
      const x = Math.min(u.x, r.x)
      const y = Math.min(u.y, r.y)
      u = { x, y, w: Math.max(u.x + u.w, r.x + r.w) - x, h: Math.max(u.y + u.h, r.y + r.h) - y, r: u.r }
    }
  }
  if (!u) return null
  // Шторка — во всю ширину и до низа: края выреза уходят за экран.
  if (s.bleed) return { x: -30, y: u.y - PAD, w: vw + 60, h: vh + 30 - (u.y - PAD), r: 24 }
  const w = u.w + PAD * 2
  const h = u.h + PAD * 2
  return { x: u.x - PAD, y: u.y - PAD, w, h, r: Math.min(s.r ?? Math.max(14, u.r + PAD), w / 2, h / 2) }
}

export function ringRect(name: string, vw: number): Box | null {
  const r = rectOf(name)
  if (!r) return null
  // Отступ от краёв экрана — как у остальных колец (лента категорий во всю ширину).
  const x = Math.max(EDGE, r.x - PAD)
  const w = Math.min(vw - EDGE, r.x + r.w + PAD) - x
  let bottom = r.y + r.h + PAD
  // Кольцо клавиш не заходит на «Записать» под ними.
  if (name === 'keypad') {
    const save = rectOf('save')
    if (save) bottom = Math.min(bottom, save.y - 2)
  }
  const h = bottom - (r.y - PAD)
  return { x, y: r.y - PAD, w, h, r: Math.min(Math.max(14, r.r + PAD), w / 2, h / 2) }
}

/** Тост «Записано · Отменить» — карточка его не закрывает. */
export function toastRect(): Box | null {
  const t = document.querySelector('[data-toast]')
  if (!t) return null
  const b = t.getBoundingClientRect()
  return b.height > 0 ? { x: b.left, y: b.top, w: b.width, h: b.height, r: 0 } : null
}

/**
 * Шторка операции на экране (выезжает, открыта или ещё уходит) — по её верху
 * (сумме), а не по «Записать»: в альбомной ориентации кнопка ниже края экрана,
 * и шторка «не открывалась» — карточка так и просила нажать «+». И шаг
 * меняется, как только лист показался, а не когда въехал целиком.
 */
export function sheetShown(): boolean {
  const a = find('amount')
  if (!a) return false
  const b = a.getBoundingClientRect()
  return b.height > 0 && b.top < innerHeight - 8
}

/**
 * Мало места под категории (низкий экран: видна полоска первой строки) —
 * сворачиваем клавиатуру, как касание пустого места: лист садится, и вся
 * сетка на виду. Сумма уже набрана; нажатие на неё вернёт клавиши.
 */
export function foldKeypadIfCramped() {
  const cats = find('categories')
  const form = find('form')
  const pad = find('keypad')
  if (!cats || !form || !pad) return
  const c = cats.getBoundingClientRect()
  const f = form.getBoundingClientRect()
  if (Math.min(c.bottom, f.bottom) - Math.max(c.top, f.top) < c.height - 8) pad.dispatchEvent(new Event('tour-fold'))
}

/* Перетекание: от того, что на экране сейчас, к живой рамке цели. */
export interface Anim {
  key: string
  /** Где цель: вкладка и «в шторке ли» — сменились, значит, другая страница. */
  kind: string
  from: Box | null
  cur: Box | null
  t0: number
  had: boolean
}
export const newAnim = (): Anim => ({ key: '', kind: '', from: null, cur: null, t0: 0, had: false })
export const ease = (t: number) => 1 - Math.pow(1 - t, 4)
export const dot = (b: Box): Box => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: 0, h: 0, r: 0 })
export const mix = (a: Box, b: Box, p: number): Box => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
  r: a.r + (b.r - a.r) * p,
})
export function animate(a: Anim, key: string, target: Box | null, now: number, dur: number, kind = '', entry?: Box): Box | null {
  if (key !== a.key || !!target !== a.had) {
    // Новая цель, или та же появилась позже (вкладка догрузилась) / ушла с экрана.
    // Цель на другой странице (вкладка, шторка) — от старой не тянемся: вырез
    // проезжал по чужому экрану и высвечивал случайный кусок. Растёт из
    // середины новой цели, у шторки — снизу, вместе с листом.
    a.from = kind !== a.kind ? (entry ?? null) : a.cur
    a.key = key
    a.kind = kind
    a.t0 = now
    a.had = !!target
  }
  // Цели нет (ушла вместе со страницей, на новом шаге выреза нет) — вырез
  // закрывается сразу: сжимаясь, он высвечивал случайный кусок новой страницы.
  if (!target) {
    a.cur = null
    return null
  }
  const p = dur > 0 ? ease(Math.min(1, (now - a.t0) / dur)) : 1
  a.cur = p >= 1 ? target : mix(a.from ?? dot(target), target, p)
  return a.cur
}
/** Перетекание ещё идёт. */
export const moving = (a: Anim, now: number, dur: number) => !!a.cur && dur > 0 && now - a.t0 < dur

export type Side = '' | 'up' | 'down'
/**
 * Где карточка. Над шторкой — вплотную к вырезу, но не выше безопасной зоны.
 * У выреза — снизу (если влезает и цель в верхней половине) или сверху,
 * хвостиком к цели; сторону, на которой уже стоит, держит, пока влезает (тост
 * ушёл — карточка не перепрыгивает). Не влезает нигде — `side: ''`, где места
 * больше. Вырезы и тост не закрывает.
 */
export function placeCard(
  mode: StepDef['card'],
  anchor: Box | null,
  keep: Box[],
  h: number,
  vh: number,
  safe: { top: number; bottom: number },
  stick: Side,
): { y: number; side: Side } {
  const top = safe.top + EDGE
  const bottom = vh - safe.bottom - EDGE
  if (mode === 'top') {
    // Вплотную к вырезу: шапка шторки (вид операции) — под карточкой целиком,
    // а не торчит из-под неё половиной кнопок.
    const hole = keep[0]
    return { y: hole ? Math.max(safe.top + 4, hole.y - 2 - h) : top, side: '' }
  }
  // Окно — лист снизу во всю ширину, как в Telegram: закрывает панель вкладок
  // (из-под карточки выглядывали «+» и подписи), отступ снизу — в самом листе.
  if (mode === 'modal') return { y: Math.max(safe.top + 8, vh - h), side: '' }
  if (!anchor) {
    let y = bottom - h - 6
    for (const k of keep) if (k.y < y + h + 12 && k.y + k.h > y) y = Math.min(y, k.y - 12 - h)
    return { y: Math.max(top, y), side: '' }
  }
  const aTop = anchor.y
  const aBottom = anchor.y + anchor.h
  let belowEnd = bottom
  let aboveStart = top
  for (const k of keep) {
    if (k === anchor) continue
    if (k.y >= aBottom - 1) belowEnd = Math.min(belowEnd, k.y - 10)
    else if (k.y + k.h <= aTop + 1) aboveStart = Math.max(aboveStart, k.y + k.h + 10)
  }
  const fitsBelow = belowEnd - (aBottom + GAP) >= h
  const fitsAbove = aTop - GAP - aboveStart >= h
  const below = { y: aBottom + GAP, side: 'up' as Side }
  const above = { y: aTop - GAP - h, side: 'down' as Side }
  if (stick === 'up' && fitsBelow) return below
  if (stick === 'down' && fitsAbove) return above
  if (fitsBelow && (aTop + anchor.h / 2 < vh * 0.55 || !fitsAbove)) return below
  if (fitsAbove) return above
  // Нигде не влезает (низкий экран, высокая цель): как можно ниже, но над тостом
  // и вкладками — закрываем низ цели, а не то, что нажать.
  return { y: Math.max(top, Math.min(belowEnd, bottom) - h), side: '' }
}

/**
 * Карточке негде встать у цели (низкий экран) — подкручиваем страницу, чтобы
 * цель оказалась наверху: под ней освободится место. Один раз на шаг.
 */
export function scrollToMakeRoom(anchor: Box, safeTop: number) {
  const room = document.documentElement.scrollHeight - innerHeight - scrollY
  const by = Math.min(anchor.y - safeTop - EDGE, room)
  if (by >= 24) window.scrollBy({ top: by, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

