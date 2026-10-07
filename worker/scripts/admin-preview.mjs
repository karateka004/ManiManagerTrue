/**
 * Предпросмотр дашборда аналитики на синтетической базе — без прода и KV.
 *
 * Дашборд — одна HTML-страница внутри шаблонной строки (src/admin.ts), и
 * посмотреть её можно только с данными. Ходить за ними в прод ради правки
 * отступа нельзя (там живые люди), а пустой локальный KV показывает пустую
 * страницу. Здесь база выдумывается детерминированно — как после рекламной
 * рассылки: старожилы, пара недель обычного притока, вчерашняя метка канала и
 * сегодняшний всплеск по рекламной ссылке, часть через бота, — и прогоняется
 * через те же расчёты, что и в воркере (analytics.ts).
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/admin-preview.mjs`
 * Открыть: http://localhost:8790/admin (пароль — любой).
 */
import { createServer } from 'node:http'
import { ADMIN_HTML } from '../src/admin.ts'
import { assemble, computeDashboard, activityStrip, sectionsOf, dayReport, digestText } from '../src/analytics.ts'
import { markDay, mskDay, mskDayStart, mskDateStr } from '../src/days.ts'

const PORT = Number(process.env.PORT ?? 8790)

/* ---------- Детерминированный генератор ---------- */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = ['Анна', 'Максим', 'Ольга', 'Дмитрий', 'Ирина', 'Сергей', 'Катя', 'Артём', 'Юля', 'Никита', 'Мария', 'Андрей', 'Лена', 'Илья', 'Таня', 'Павел', 'Вика', 'Денис', 'Алина', 'Олег', 'Даша', 'Роман', 'Настя', 'Кирилл', 'Polina', 'Alex', 'Oksana', 'Bohdan', 'Мирослава', 'Святослав']
const SURN = ['', '', 'К.', 'Смирнова', 'Петров', 'Ковальчук', 'Иванова', '', 'Шевченко', 'Орлов']
const CUR = ['UAH', 'UAH', 'UAH', 'EUR', 'USD', 'USD', 'RUB', 'PLN', 'KZT']
const EV = ['a', 'c', 'p', 'k', 'b', 'g', 'z', 'l', 'h', 'r', 'e', 's']

function build(now) {
  const r = rng(20261007)
  const today = mskDay(now)
  const hourNow = Math.floor(((now + 3 * 3600000) / 3600000) % 24)
  const trackFrom = today - 9
  const data = []
  const lb = {}
  const inbox = []
  const srcs = []
  const claimed = []
  const blocked = []
  let id = 400000000

  const pick = (arr) => arr[Math.floor(r() * arr.length)]
  const name = () => (pick(NAMES) + ' ' + pick(SURN)).trim()

  /** Один человек: день и час прихода, судьба после. */
  function person({ day, hour, src, ref, viaBot, activate, returnP, appToo = true }) {
    id += 1 + Math.floor(r() * 9000)
    const uid = String(id)
    const firstSeen = mskDayStart(day) + hour * 3600000 + Math.floor(r() * 3600000)
    if (firstSeen > now) return
    const nm = name()
    const username = r() < 0.55 ? 'user' + uid.slice(-5) : undefined

    // Дни активности: день прихода, дальше с убывающей вероятностью.
    const days = [day]
    for (let d = day + 1; d <= today; d++) if (r() < returnP * Math.pow(0.93, d - day)) days.push(d)
    const lastDay = days[days.length - 1]
    const lastSeen = Math.min(now, mskDayStart(lastDay) + (8 + Math.floor(r() * 13)) * 3600000)
    const tracked = days.filter((d) => d >= trackFrom)
    let mask
    for (const d of tracked) mask = markDay(mask, d)

    const ops = activate ? Math.max(1, Math.round(Math.pow(r(), 2.2) * 140 * Math.min(1, days.length / 6))) : 0
    if (viaBot && activate) {
      const bm = tracked.length ? mask : undefined
      inbox.push([uid, { n: Math.max(1, Math.round(ops * (0.5 + r() * 0.5))), f: firstSeen + 120000, l: lastSeen, ...(bm ? { m: bm.m, d: bm.d } : {}) }])
    }
    if (src && viaBot) srcs.push([uid, { s: src, at: firstSeen, n: nm, ...(username ? { u: username } : {}) }])
    if (ref) claimed.push(uid)
    if (r() < 0.04) blocked.push(uid)

    if (!appToo) return
    lb[uid] = {
      id: Number(uid),
      name: nm,
      ...(username ? { username } : {}),
      xp: ops * 12 + Math.floor(r() * 200),
      level: 1 + Math.min(9, Math.floor(ops / 15)),
      ops,
      coins: Math.floor(r() * 300),
      streakBest: Math.floor(r() * Math.min(30, days.length + 1)),
      refs: ref ? 0 : r() < 0.06 ? 1 + Math.floor(r() * 6) : 0,
      at: lastSeen,
      firstSeen,
      ...(day < today - 60 && r() < 0.5 ? { fsx: 1 } : {}),
      ...(src && !viaBot ? { src } : {}),
      ...(mask ? { vm: mask.m, vd: mask.d } : {}),
    }
    if (ops > 0 || r() < 0.6) {
      const lt = Math.floor((mskDayStart(lastDay) + 12 * 3600000) / 86400000)
      const ev = {}
      for (const code of EV) if (r() < 0.35) ev[code] = 1 + Math.floor(r() * 20)
      data.push([
        uid,
        {
          updatedAt: lastSeen,
          firstSeen,
          c: {
            ops,
            ...(ops ? { ft: lt - days.length, lt, dd: Math.min(ops, days.length + Math.floor(r() * 3)) } : {}),
            cur: pick(CUR),
            lang: r() < 0.86 ? 'ru' : 'en',
            th: pick(['auto', 'auto', 'dark', 'light']),
            ...(r() < 0.18 ? { bud: 1 } : {}),
            ...(r() < 0.12 ? { lim: 1 + Math.floor(r() * 4) } : {}),
            ...(r() < 0.15 ? { gl: 1 + Math.floor(r() * 2) } : {}),
            ...(r() < 0.05 ? { iv: 1 } : {}),
            ...(r() < 0.1 ? { cat: 1 + Math.floor(r() * 3) } : {}),
            ...(Object.keys(ev).length ? { ev } : {}),
            v: r() < 0.9 ? 16 : 15,
          },
          ...(mask ? { vm: mask.m, vd: mask.d } : {}),
        },
      ])
    }
  }

  // Старожилы: последние 10 недель, по одному-двое в день.
  for (let d = today - 70; d < today - 9; d++) {
    const n = r() < 0.6 ? 1 : r() < 0.5 ? 2 : 0
    for (let i = 0; i < n; i++) person({ day: d, hour: 8 + Math.floor(r() * 14), ref: r() < 0.3, activate: r() < 0.45, returnP: 0.35 })
  }
  // Обычный приток последних дней.
  for (let d = today - 9; d < today; d++) {
    const n = 1 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) person({ day: d, hour: 8 + Math.floor(r() * 14), ref: r() < 0.35, activate: r() < 0.4, returnP: 0.4, viaBot: r() < 0.25 })
  }
  // Позавчера — пост в канале с меткой.
  for (let i = 0; i < 17; i++) person({ day: today - 2, hour: 11 + Math.floor(r() * 9), src: 'chan_fin', activate: r() < 0.5, returnP: 0.45, viaBot: r() < 0.4 })
  // Сегодня — рекламная рассылка с утра: всплеск, часть через бота, часть только «Старт».
  for (let i = 0; i < 64; i++) {
    const hour = Math.min(hourNow, 9 + Math.floor(Math.pow(r(), 1.6) * 9))
    const viaBot = r() < 0.55
    person({ day: today, hour, src: 'ads_oct', activate: r() < 0.36, returnP: 0, viaBot, appToo: !viaBot || r() < 0.45 })
  }
  // Немного обычных сегодня.
  for (let i = 0; i < 4; i++) person({ day: today, hour: Math.floor(r() * (hourNow + 1)), activate: r() < 0.4, returnP: 0 })

  // История снимков за 60 дней.
  const history = []
  let total = 60
  for (let d = today - 60; d < today; d++) {
    const fresh = d === today - 2 ? 19 : 1 + Math.floor(r() * 3)
    total += fresh
    history.push({
      date: mskDateStr(mskDayStart(d)),
      total,
      withData: Math.round(total * 0.38),
      new: fresh,
      dau: 6 + Math.floor(r() * 10) + (d === today - 2 ? 14 : 0),
      wau: 20 + Math.floor(r() * 8),
      mau: 40 + Math.floor(r() * 10),
      blocked: 3,
      ...(d >= today - 30 ? { writers: 8 + Math.floor(r() * 6), newAct: Math.floor(fresh * 0.4) } : {}),
    })
  }

  return { c: assemble(data, lb, inbox, srcs, claimed, blocked), history }
}

/* ---------- Сервер ---------- */
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
const readBody = (req) =>
  new Promise((resolve) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'))
      } catch {
        resolve({})
      }
    })
  })

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(ADMIN_HTML)
  }
  const authed = req.headers['x-admin-key'] || req.headers['x-tg-init-data']
  if (!authed) return json(res, 403, { ok: false, error: 'forbidden' })
  const now = Date.now()
  const { c, history } = build(now)
  const body = await readBody(req)
  if (url.pathname === '/admin/stats') {
    const webhook = process.env.WEBHOOK === 'bad'
      ? { registered: true, pending: 137, lastError: 'Read timeout expired', lastErrorAt: now - 120000, ok: false }
      : { registered: true, pending: 0, ok: true }
    return json(res, 200, { ...computeDashboard(c, history, now, webhook), backfill: null })
  }
  if (url.pathname === '/admin/person') {
    const p = c.people.find((x) => x.id === String(body.id))
    if (!p) return json(res, 404, { ok: false })
    const today = mskDay(now)
    return json(res, 200, {
      ok: true,
      id: p.id,
      name: p.name,
      username: p.username,
      firstSeen: p.firstSeen,
      lastSeen: p.lastSeen,
      approx: p.approx,
      src: p.src,
      fromRef: p.fromRef,
      blocked: p.blocked,
      remindersOff: p.card?.rm === 0,
      inApp: p.inApp,
      ops: p.ops,
      botOps: p.botOps,
      botFirst: p.bot?.f,
      botLast: p.bot?.l,
      lastWrite: p.lastWrite,
      card: p.card ?? null,
      sections: sectionsOf(p.card),
      game: { xp: p.xp, level: p.level, coins: p.coins, streakBest: p.streakBest, refs: p.refs },
      strip: activityStrip(p, c.trackFrom, today, 35),
      stripFrom: mskDayStart(today - 34),
      trackFrom: c.trackFrom === null ? null : mskDayStart(c.trackFrom),
    })
  }
  if (url.pathname === '/admin/digest') {
    console.log('\n--- сводка ---\n' + digestText(dayReport(c, mskDay(now), now)) + '\n')
    return json(res, 200, { ok: true })
  }
  json(res, 404, { ok: false })
}).listen(PORT, () => console.log(`Дашборд: http://localhost:${PORT}/admin  (пароль — любой)`))
