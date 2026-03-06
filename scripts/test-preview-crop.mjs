import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

function readToken() {
  const raw = fs.readFileSync('.env.local', 'utf8')
  const match =
    raw.match(/META_AD_LIBRARY_ACCESS_TOKEN\s*=\s*"([^"]+)"/) ||
    raw.match(/META_AD_LIBRARY_ACCESS_TOKEN\s*=\s*([^\r\n]+)/)
  return match?.[1]?.trim() ?? ''
}

const token = readToken()
const snapshotUrl = `https://www.facebook.com/ads/archive/render_ad/?id=892236963553868&access_token=${token}`

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 1 })
  await page.goto(snapshotUrl, { waitUntil: 'networkidle2', timeout: 45000 })
  await new Promise((r) => setTimeout(r, 2000))

  // Try to dismiss cookie banner
  const buttons = await page.$$('button')
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => el.textContent || '')
    if (/allow|accept|decline|only allow|essential/i.test(text)) {
      console.log('Clicking cookie button:', text.trim().slice(0, 80))
      await btn.click()
      await new Promise((r) => setTimeout(r, 1500))
      break
    }
  }

  // Also try hiding overlays via DOM
  await page.evaluate(() => {
    document.querySelectorAll('div._10.uiLayer._4-hy, div._59s7._9l2g, [role="dialog"]').forEach((el) => {
      el.style.display = 'none'
    })
    document.querySelectorAll('div, section, aside').forEach((el) => {
      if ((el.textContent || '').toLowerCase().includes('cookies') && el.getBoundingClientRect().height > 200) {
        el.style.display = 'none'
      }
    })
  })

  // Find the ad card container
  const clip = await page.evaluate(() => {
    // Meta's ad card is inside div._8n-d
    const card = document.querySelector('div._8n-d')
    if (card) {
      const r = card.getBoundingClientRect()
      if (r.width > 100 && r.height > 100) {
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height }
      }
    }
    // Fallback: find the largest centered image
    const imgs = Array.from(document.querySelectorAll('img')).filter((i) => {
      const rect = i.getBoundingClientRect()
      return rect.width > 200 && rect.height > 200
    })
    if (imgs.length > 0) {
      const best = imgs.sort((a, b) => {
        const ra = a.getBoundingClientRect()
        const rb = b.getBoundingClientRect()
        return rb.width * rb.height - ra.width * ra.height
      })[0]
      const r = best.getBoundingClientRect()
      return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }
    }
    return null
  })

  console.log('Clip region:', JSON.stringify(clip))

  const buf = await page.screenshot({
    type: 'png',
    ...(clip ? { clip } : { fullPage: false }),
  })

  fs.writeFileSync('test-preview.png', buf)
  console.log(`Saved test-preview.png (${buf.length} bytes)`)

  // Also save full page for comparison
  const fullBuf = await page.screenshot({ type: 'png', fullPage: false })
  fs.writeFileSync('test-preview-full.png', fullBuf)
  console.log(`Saved test-preview-full.png (${fullBuf.length} bytes)`)
} finally {
  await browser.close()
}
