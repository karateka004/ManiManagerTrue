/**
 * Ролик из сцены: Chromium снимает кадр за кадром (window.renderAt(t)), ffmpeg
 * склеивает. Сначала — мастер без потерь (кадры частями в несколько процессов),
 * из него — mp4 и gif нужных размеров; звук — sound.mjs по window.SOUNDS.
 *
 *   node promo/render.cjs land start      стартовый экран бота: 960×540 mp4 и 640×360 gif (без звука)
 *   node promo/render.cjs square ad       пост: 1080×1080 mp4 со звуком и без, gif 600×600
 *   node promo/render.cjs story ad        сторис: 1080×1920 mp4 — звуки действий; звуки и фон
 *   … --jobs 4                            кадры в 4 процесса (по числу ядер)
 *   … --stills 2.9,8.6                    отдельные кадры в png
 *
 * Нужны playwright (глобально или в проекте) и ffmpeg. Итог — в promo/out/.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(p)
    } catch {}
  }
  throw new Error('Нужен playwright: npm i -g playwright')
}

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const [layout = 'land', cta = 'start'] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))
const stills = flag('--stills')?.split(',').map(Number)
const jobs = Number(flag('--jobs') ?? 1)
const part = flag('--part') !== undefined ? Number(flag('--part')) : null
const FPS = 30
const SIZE = { land: [960, 540], square: [1080, 1080], story: [1080, 1920] }[layout]
// Сторис крупная — хватает полуторного запаса для сглаживания.
const DPR = layout === 'story' ? 1.5 : 2
const OUT = path.join(__dirname, 'out')
const name = `koshel-2.7-${layout}-${cta}`
fs.mkdirSync(OUT, { recursive: true })

/** Что получаем из мастера: [файл, масштаб, вид]; звук — 'sfx' или 'music'. */
const TARGETS = {
  land: [
    [`${name}-960x540.mp4`, 'scale=960:540', 'mp4'],
    [`${name}-640x360.gif`, 'scale=640:360:flags=lanczos', 'gif'],
  ],
  square: [
    [`${name}-1080.mp4`, 'scale=1080:1080', 'mp4'],
    [`${name}-1080-sound.mp4`, 'scale=1080:1080', 'mp4', 'sfx'],
    [`${name}-600.gif`, 'scale=600:600:flags=lanczos', 'gif'],
  ],
  story: [
    [`${name}-sound.mp4`, 'scale=1080:1920', 'mp4', 'sfx'],
    [`${name}-music.mp4`, 'scale=1080:1920', 'mp4', 'music'],
  ],
}[layout]

function run(cmd, args, feed) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [feed ? 'pipe' : 'ignore', 'inherit', 'inherit'] })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}`))))
    if (feed) feed(p.stdin)
  })
}
const ffmpeg = (args, feed) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], feed)

/** Громкость для соцсетей: −14 LUFS, потолок −1 dBTP — loudnorm в два прохода (замер, потом точная правка). */
async function loudnorm(src, dst) {
  const m = await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => (code === 0 ? resolve(JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1))) : reject(new Error('loudnorm'))))
  })
  await ffmpeg(['-i', src, '-af',
    `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    '-ar', '48000', dst])
}

async function openScene() {
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: DPR })
  page.on('pageerror', (e) => console.error('[сцена]', e.message))
  await page.goto(`file://${path.join(__dirname, 'bot-update.html')}?layout=${layout}&cta=${cta}`)
  await page.evaluate(() => window.sceneReady)
  return { browser, page, duration: await page.evaluate(() => window.DURATION), sounds: await page.evaluate(() => window.SOUNDS) }
}

/** Кадры [from, to) в мастер без потерь; кадры в DPR× уменьшаем lanczos — сглаживание как у живого экрана. */
async function renderFrames(page, from, to, file, label) {
  await ffmpeg(
    ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
      '-vf', `scale=${SIZE[0]}:${SIZE[1]}:flags=lanczos`, '-c:v', 'ffv1', '-pix_fmt', 'bgr0', file],
    async (stdin) => {
      for (let i = from; i < to; i++) {
        await page.evaluate((t) => window.renderAt(t), i / FPS)
        const png = await page.screenshot({ type: 'png' })
        if (!stdin.write(png)) await new Promise((r) => stdin.once('drain', r))
        if ((i - from) % 90 === 0) console.log(`${label}: кадр ${i - from}/${to - from}`)
      }
      stdin.end()
    },
  )
}

;(async () => {
  const { browser, page, duration, sounds } = await openScene()
  const frames = Math.round(duration * FPS)

  if (stills) {
    for (const t of stills) {
      await page.evaluate((t) => window.renderAt(t), t)
      const file = path.join(OUT, `${name}-t${t.toFixed(1)}.png`)
      await page.screenshot({ path: file })
      console.log(file)
    }
    await browser.close()
    return
  }

  // Процесс-часть: свой кусок кадров — и всё.
  if (part !== null) {
    const from = Math.floor((part * frames) / jobs)
    const to = Math.floor(((part + 1) * frames) / jobs)
    await renderFrames(page, from, to, path.join(OUT, `${name}-part${part}.mkv`), `${name} часть ${part + 1}/${jobs}`)
    await browser.close()
    return
  }

  const started = Date.now()
  const master = path.join(OUT, `${name}-master.mkv`)
  if (jobs > 1) {
    await browser.close()
    await Promise.all(
      Array.from({ length: jobs }, (_, k) => run(process.execPath, [__filename, layout, cta, '--jobs', String(jobs), '--part', String(k)])),
    )
    const list = path.join(OUT, `${name}-parts.txt`)
    fs.writeFileSync(list, Array.from({ length: jobs }, (_, k) => `file '${path.join(OUT, `${name}-part${k}.mkv`)}'`).join('\n'))
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', master])
    for (let k = 0; k < jobs; k++) fs.rmSync(path.join(OUT, `${name}-part${k}.mkv`))
    fs.rmSync(list)
  } else {
    await renderFrames(page, 0, frames, master, name)
    await browser.close()
  }
  console.log(`${name}: ${frames} кадров за ${((Date.now() - started) / 1000).toFixed(0)} с`)

  // Звук — по тем же моментам, что и анимация.
  const { renderWav } = await import('./sound.mjs')
  const wavs = {}
  for (const kind of new Set(TARGETS.map((x) => x[3]).filter(Boolean))) {
    const raw = path.join(OUT, `${name}-${kind}-raw.wav`)
    wavs[kind] = path.join(OUT, `${name}-${kind}.wav`)
    fs.writeFileSync(raw, renderWav(sounds, duration, { music: kind === 'music' }))
    await loudnorm(raw, wavs[kind])
    fs.rmSync(raw)
  }

  for (const [file, scale, kind, audio] of TARGETS) {
    const out = path.join(OUT, file)
    if (kind === 'mp4') {
      const input = audio ? ['-i', master, '-i', wavs[audio]] : ['-i', master]
      const sound = audio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest'] : ['-an']
      await ffmpeg([...input, '-vf', scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation',
        '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', ...sound, out])
    } else {
      // Палитра по всему ролику, перерисовка только изменившихся областей — гиф легче вдвое.
      await ffmpeg(['-i', master, '-vf',
        `fps=15,${scale},split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
        '-loop', '0', out])
    }
    console.log(`${file}: ${(fs.statSync(out).size / 1024).toFixed(0)} КБ`)
  }
  fs.rmSync(master)
  for (const w of Object.values(wavs)) fs.rmSync(w)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
