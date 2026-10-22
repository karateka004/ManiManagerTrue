/**
 * Ролик из сцены: Chromium снимает кадр за кадром (window.renderAt(t)), ffmpeg
 * склеивает. Сначала — мастер без потерь, из него — mp4 и gif нужных размеров.
 *
 *   node promo/render.cjs land start       стартовый экран бота: 960×540 и 640×360
 *   node promo/render.cjs square ad        пост: 1080×1080 mp4 и gif 600×600
 *   node promo/render.cjs land start --stills 2.9,8.6   отдельные кадры в png
 *
 * Нужны playwright (глобально или в проекте) и ffmpeg. Итог — в promo/out/.
 */
const { spawn, execFileSync } = require('node:child_process')
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

const [layout = 'land', cta = 'start'] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^[\d.,]+$/.test(a))
const stillsArg = process.argv.indexOf('--stills')
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null
const FPS = 30
const DPR = 2
const SIZE = layout === 'square' ? { width: 1080, height: 1080 } : { width: 960, height: 540 }
const OUT = path.join(__dirname, 'out')
const name = `koshel-2.7-${layout}-${cta}`
fs.mkdirSync(OUT, { recursive: true })

/** Что получаем из мастера: [файл, фильтр масштаба, формат]. */
const TARGETS = {
  land: [
    [`${name}-960x540.mp4`, 'scale=960:540', 'mp4'],
    [`${name}-640x360.mp4`, 'scale=640:360:flags=lanczos', 'mp4'],
    [`${name}-640x360.gif`, 'scale=640:360:flags=lanczos', 'gif'],
  ],
  square: [
    [`${name}-1080.mp4`, 'scale=1080:1080', 'mp4'],
    [`${name}-600.gif`, 'scale=600:600:flags=lanczos', 'gif'],
  ],
}

function ffmpeg(args, stdin) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))))
    if (stdin) stdin(p.stdin)
  })
}

;(async () => {
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: DPR })
  page.on('pageerror', (e) => console.error('[сцена]', e.message))
  const url = `file://${path.join(__dirname, 'bot-update.html')}?layout=${layout}&cta=${cta}`
  await page.goto(url)
  await page.evaluate(() => window.sceneReady)
  const duration = await page.evaluate(() => window.DURATION)

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

  // Мастер без потерь: кадры в 2× уменьшаем lanczos — сглаживание как у живого экрана.
  const master = path.join(OUT, `${name}-master.mkv`)
  const frames = Math.round(duration * FPS)
  const started = Date.now()
  await ffmpeg(
    ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
      '-vf', `scale=${SIZE.width}:${SIZE.height}:flags=lanczos`, '-c:v', 'ffv1', '-pix_fmt', 'bgr0', master],
    async (stdin) => {
      for (let i = 0; i < frames; i++) {
        await page.evaluate((t) => window.renderAt(t), i / FPS)
        const png = await page.screenshot({ type: 'png' })
        if (!stdin.write(png)) await new Promise((r) => stdin.once('drain', r))
        if (i % 60 === 0) process.stdout.write(`\r${name}: кадр ${i}/${frames}`)
      }
      stdin.end()
    },
  )
  await browser.close()
  console.log(`\r${name}: ${frames} кадров за ${((Date.now() - started) / 1000).toFixed(0)} с`)

  for (const [file, scale, kind] of TARGETS[layout]) {
    const out = path.join(OUT, file)
    if (kind === 'mp4') {
      await ffmpeg(['-i', master, '-vf', scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out])
    } else {
      // Палитра по всему ролику, перерисовка только изменившихся областей — гиф легче вдвое.
      await ffmpeg(['-i', master, '-vf',
        `fps=15,${scale},split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
        '-loop', '0', out])
    }
    console.log(`${file}: ${(fs.statSync(out).size / 1024).toFixed(0)} КБ`)
  }
  fs.rmSync(master)
  try {
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, TARGETS[layout][0][0])], { stdio: 'inherit' })
  } catch {}
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
