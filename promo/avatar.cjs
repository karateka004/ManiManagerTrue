/**
 * Аватарки: promo/avatar.html → JPG 640×640 (Telegram больше не хранит, а
 * setMyProfilePhoto принимает только JPG).
 *
 *   node promo/avatar.cjs [папка]   → koshel-bot-avatar.jpg (светлая) и koshel-channel-avatar.jpg (тёмная),
 *                                    по умолчанию в promo/media/
 */
const path = require('node:path')

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(p)
    } catch {}
  }
  throw new Error('Нужен playwright: npm i -g playwright')
}

const dir = path.resolve(process.argv[2] || path.join(__dirname, 'media'))
const AVATARS = [
  ['mint', 'koshel-bot-avatar.jpg'],
  ['night', 'koshel-channel-avatar.jpg'],
]

;(async () => {
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch()
  for (const [variant, file] of AVATARS) {
    const page = await browser.newPage({ viewport: { width: 640, height: 640 } })
    await page.goto(`file://${path.join(__dirname, 'avatar.html')}#${variant}`)
    await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 640, height: 640 } })
    await page.close()
    console.log(`${variant} → ${path.join(dir, file)}`)
  }
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
