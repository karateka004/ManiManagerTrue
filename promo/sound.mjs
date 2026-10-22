/**
 * Звук ролика — синтез по списку событий сцены (window.SOUNDS): клавиши,
 * отправка, ответ бота, микрофон, затвор, скан, финал. Без чужих сэмплов —
 * лицензировать нечего, и каждый звук стоит ровно в кадре своего действия.
 *
 * renderWav(events, duration, { music }) → Buffer с WAV (48 кГц, стерео, 16 бит).
 * music — лёгкий фон (100 ударов в минуту): пэд, бас, бочка, хэт.
 */
const SR = 48000
const TAU = Math.PI * 2

/** Детерминированный шум: одинаковый звук при каждом рендере. */
function noiseGen(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2147483648 - 1
  }
}

/** Фильтр «переменной частоты» (SVF): полоса с подвижной серединой — для свиста и «вжух». */
function svf() {
  let low = 0, band = 0
  return (x, fc, q = 0.7) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR)
    low += f * band
    const high = x - low - q * band
    band += f * high
    return { low, band, high }
  }
}

const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay))
const note = (n) => 440 * Math.pow(2, (n - 69) / 12)

export function renderWav(events, duration, { music = false } = {}) {
  const n = Math.ceil((duration + 0.4) * SR)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const rnd = noiseGen(20261022)

  /** Положить звук: fn(t) по семплам, с панорамой (-1…1) и громкостью. */
  function add(t0, len, fn, pan = 0, gain = 1) {
    const s0 = Math.round(t0 * SR)
    const m = Math.round(len * SR)
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
    for (let i = 0; i < m; i++) {
      const j = s0 + i
      if (j < 0 || j >= n) continue
      const v = fn(i / SR)
      L[j] += v * gl
      R[j] += v * gr
    }
  }

  /* ---------- Звуки действий ---------- */
  const SFX = {
    // Клавиша: мягкий короткий щелчок, чуть разный по высоте и месту.
    key(e) {
      const noise = noiseGen(1000 + e.i * 7)
      const f = svf()
      const pitch = 1800 + rnd() * 800
      add(e.t, 0.05, (t) => f(noise(), pitch, 1.2).band * env(t, 0.0008, 0.01), rnd() * 0.5 - 0.25, 0.5 + rnd() * 0.1)
    },
    // Отправка: «фьють» вверх — пузырь улетел.
    send(e) {
      const noise = noiseGen(31)
      const f = svf()
      let ph = 0
      add(e.t - 0.02, 0.16, (t) => {
        ph += (TAU * (520 + 2400 * t * t * 40)) / SR
        const tone = Math.sin(ph) * env(t, 0.006, 0.045)
        const air = f(noise(), 900 + 9000 * t, 0.9).band * env(t, 0.02, 0.05) * 0.5
        return tone * 0.5 + air
      }, 0.15, 0.32)
    },
    // Ответ бота: две мягкие ноты вверх, как у мессенджера.
    receive(e) {
      for (const [dt, midi] of [[0, 84], [0.07, 88]]) {
        const f0 = note(midi)
        add(e.t + dt, 0.5, (t) => (Math.sin(TAU * f0 * t) + 0.18 * Math.sin(TAU * f0 * 3.01 * t) * Math.exp(-t / 0.05)) * env(t, 0.003, 0.16), -0.1, 0.2)
      }
    },
    // Карточка ответа: то же, но аккорд вверх из трёх нот — ответ богаче записи.
    card(e) {
      for (const [dt, midi] of [[0, 84], [0.06, 88], [0.12, 91], [0.18, 96]]) {
        const f0 = note(midi)
        add(e.t + dt, 0.7, (t) => (Math.sin(TAU * f0 * t) + 0.15 * Math.sin(TAU * f0 * 2.01 * t)) * env(t, 0.004, 0.22), 0, 0.15)
      }
    },
    // Смена эпизода: лёгкий «вжух» шумом.
    swish(e) {
      const noise = noiseGen(77)
      const f = svf()
      add(e.t - 0.12, 0.32, (t) => f(noise(), 500 + 5000 * (t / 0.32), 1.1).band * Math.sin((Math.PI * t) / 0.32), -0.3 + rnd() * 0.6, 0.22)
    },
    // Микрофон: «буп» вверх — запись пошла; вниз — отпустил.
    recStart(e) {
      for (const [dt, midi] of [[0, 76], [0.075, 83]]) add(e.t + dt, 0.12, (t) => Math.sin(TAU * note(midi) * t) * env(t, 0.004, 0.035), 0, 0.22)
    },
    recStop(e) {
      for (const [dt, midi] of [[0, 83], [0.075, 76]]) add(e.t + dt, 0.12, (t) => Math.sin(TAU * note(midi) * t) * env(t, 0.004, 0.035), 0, 0.2)
    },
    // Затвор: два механических щелчка и глухой удар.
    shutter(e) {
      for (const [dt, seed, g] of [[0, 5, 0.28], [0.07, 9, 0.21]]) {
        const noise = noiseGen(seed)
        const f = svf()
        add(e.t + dt, 0.06, (t) => f(noise(), 2600, 0.8).band * env(t, 0.0005, 0.009), 0, g)
      }
      add(e.t, 0.08, (t) => Math.sin(TAU * (160 - 600 * t) * t) * env(t, 0.001, 0.02), 0, 0.17)
    },
    // Скан: тихая восходящая трель, пока луч идёт по чеку.
    scan(e) {
      let ph = 0
      add(e.t, e.dur, (t) => {
        const k = t / e.dur
        ph += (TAU * (620 + 1300 * k)) / SR
        return Math.sin(ph) * (0.5 + 0.5 * Math.sin(TAU * 16 * t)) * Math.sin(Math.PI * k)
      }, 0.2, 0.15)
    },
    // Итог найден: светлый «динь».
    found(e) {
      for (const f0 of [note(93), note(100)]) add(e.t, 0.45, (t) => Math.sin(TAU * f0 * t) * env(t, 0.002, 0.12), 0.2, 0.12)
    },
    // Финал: длинный «вжух» и мягкий аккорд.
    whoosh(e) {
      const noise = noiseGen(123)
      const f = svf()
      add(e.t - 0.25, 0.6, (t) => f(noise(), 300 + 4000 * (t / 0.6), 0.9).band * Math.sin((Math.PI * t) / 0.6), 0, 0.3)
    },
    chord(e) {
      ;[72, 76, 79, 86].forEach((midi, k) => {
        const f0 = note(midi)
        const pan = -0.4 + k * 0.27
        add(e.t + k * 0.03, 3, (t) => {
          const vib = 1 + 0.003 * Math.sin(TAU * 5 * t)
          return (Math.sin(TAU * f0 * vib * t) + 0.25 * Math.sin(TAU * f0 * 2 * t)) * env(t, 0.05, 1.2)
        }, pan, 0.09)
      })
    },
  }
  for (const e of events) SFX[e.kind]?.(e)

  /* ---------- Фон ---------- */
  if (music) {
    const BEAT = 60 / 100
    // Am7 — Fmaj7 — C — G, по такту на аккорд.
    const CHORDS = [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [48, 55, 60, 64],
      [55, 59, 62, 67],
    ]
    const bars = Math.ceil(duration / (BEAT * 4))
    const mL = new Float32Array(n)
    const mR = new Float32Array(n)
    const put = (t0, len, fn, pan, gain) => {
      const s0 = Math.round(t0 * SR)
      const m = Math.round(len * SR)
      const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
      const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
      for (let i = 0; i < m; i++) {
        const j = s0 + i
        if (j < 0 || j >= n) continue
        const v = fn(i / SR)
        mL[j] += v * gl
        mR[j] += v * gr
      }
    }
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * BEAT * 4
      const chord = CHORDS[bar % 4]
      // Пэд: мягкие ноты аккорда на весь такт.
      chord.forEach((midi, k) => {
        const f0 = note(midi + 12)
        const len = BEAT * 4 + 0.3
        put(t0, len, (t) => {
          const a = Math.min(1, t / 0.35) * Math.min(1, (len - t) / 0.4)
          return (Math.sin(TAU * f0 * t) + 0.3 * Math.sin(TAU * f0 * 2.003 * t) + 0.12 * Math.sin(TAU * f0 * 3.01 * t)) * a
        }, -0.5 + k * 0.33, 0.045)
      })
      for (let beat = 0; beat < 4; beat++) {
        const tb = t0 + beat * BEAT
        // Бочка и бас — на сильные доли.
        if (beat % 2 === 0) {
          // Бочка со щелчком сверху: на динамике телефона низа нет, щелчок слышно.
          let ph = 0
          const click = noiseGen(700 + bar * 4 + beat)
          const cf = svf()
          put(tb, 0.3, (t) => {
            ph += (TAU * (48 + 110 * Math.exp(-t / 0.03))) / SR
            return Math.sin(ph) * env(t, 0.002, 0.12) + cf(click(), 3000, 1).band * env(t, 0.0005, 0.005) * 0.8
          }, 0, 0.2)
          // Бас со второй гармоникой — чтобы его было слышно и без сабвуфера.
          const fb = note(chord[0] - 12)
          put(tb, BEAT * 1.8, (t) => (Math.sin(TAU * fb * t) + 0.5 * Math.sin(TAU * 2 * fb * t)) * env(t, 0.01, 0.35), 0, 0.14)
        }
        // Хлопок — на слабые.
        if (beat % 2 === 1) {
          const noise = noiseGen(400 + bar * 4 + beat)
          const f = svf()
          put(tb, 0.2, (t) => f(noise(), 1700, 1.0).band * env(t, 0.002, 0.05), 0.1, 0.1)
        }
        // Хэт — восьмыми, тихо.
        for (const half of [0, 0.5]) {
          const noise = noiseGen(900 + bar * 16 + beat * 2 + half * 2)
          const f = svf()
          put(tb + half * BEAT, 0.06, (t) => f(noise(), 7500, 1.2).high * env(t, 0.001, 0.012), 0.35, half ? 0.06 : 0.035)
        }
      }
    }
    // Фон — на 6 дБ тише звуков действий и приседает под каждым (около −8 дБ);
    // входит сразу — первые секунды сторис самые ценные; уходит плавно.
    const duck = new Float32Array(n)
    for (const e of events) {
      const s0 = Math.round((e.t - 0.03) * SR)
      for (let i = 0; i < SR * 0.4; i++) if (s0 + i >= 0 && s0 + i < n) duck[s0 + i] = Math.max(duck[s0 + i], 1 - i / (SR * 0.4))
    }
    for (let j = 0; j < n; j++) {
      const t = j / SR
      const fade = Math.min(1, t / 0.03) * Math.min(1, Math.max(0, (duration - t) / 1.5))
      const g = 0.5 * fade * (1 - 0.6 * duck[j])
      L[j] += mL[j] * g
      R[j] += mR[j] * g
    }
  }

  /* ---------- Мастер ---------- */
  // Здесь — только запас по пику (−6 dBFS); громкость до −14 LUFS доводит
  // render.cjs (loudnorm в два прохода, потолок −1 dBTP).
  let peak = 0
  for (let j = 0; j < n; j++) peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]))
  const gain = 0.5 / (peak || 1)
  const pcm = Buffer.alloc(44 + n * 4)
  for (let j = 0; j < n; j++) {
    pcm.writeInt16LE(Math.round(L[j] * gain * 32767), 44 + j * 4)
    pcm.writeInt16LE(Math.round(R[j] * gain * 32767), 46 + j * 4)
  }
  // Заголовок WAV.
  pcm.write('RIFF', 0)
  pcm.writeUInt32LE(36 + n * 4, 4)
  pcm.write('WAVE', 8)
  pcm.write('fmt ', 12)
  pcm.writeUInt32LE(16, 16)
  pcm.writeUInt16LE(1, 20)
  pcm.writeUInt16LE(2, 22)
  pcm.writeUInt32LE(SR, 24)
  pcm.writeUInt32LE(SR * 4, 28)
  pcm.writeUInt16LE(4, 32)
  pcm.writeUInt16LE(16, 34)
  pcm.write('data', 36)
  pcm.writeUInt32LE(n * 4, 40)
  return pcm
}
