/**
 * Measures the content column against the panel it sits in, at several widths.
 *
 *   node specs/020-fluid-content-column/measure.mjs
 *
 * This is the acceptance for SC-001, and it cannot live in vitest: jsdom does
 * no layout, so getBoundingClientRect() returns zeroes and any assertion about
 * a proportion would pass whatever the CSS said.
 *
 * It is written to FAIL, which is the point. Change the column back to a fixed
 * max-width and the spread across widths blows past the tolerance -- that
 * check is a step in the task list, not an afterthought, because a layout
 * assertion that was only ever seen passing is not evidence of anything.
 *
 * Needs the walkthrough instance running (see quickstart.md).
 */
import { chromium } from '../../.ds-sync/node_modules/playwright/index.mjs'

const BASE = process.env.NEXUS_URL ?? 'http://localhost:8818'
const EMAIL = process.env.NEXUS_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.NEXUS_PASSWORD ?? 'devpass018x'

/** Above the floor the void must be a constant share of the panel. */
const FLUID = [1920, 2560, 3840]
/** At and below the floor the column must still be exactly 960. */
const FLOORED = [1440, 1366]
const TOLERANCE = 5 // percentage points, per SC-001

const browser = await chromium.launch({ executablePath: process.env.DS_CHROMIUM_PATH ?? '/usr/bin/google-chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByLabel(/邮箱|email/i).fill(EMAIL)
await page.getByLabel(/密码|password/i).fill(PASSWORD)
await page.getByRole('button', { name: /登录|sign in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'))

async function measure(width) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${BASE}/assets`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const col = main.firstElementChild
    const s = getComputedStyle(main)
    // The containing block is the panel's content box, not its border box:
    // that is what a percentage width resolves against.
    const inner = main.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    const w = col.getBoundingClientRect().width
    return { inner: Math.round(inner), column: Math.round(w), void: Math.round(inner - w) }
  })
}

const rows = []
for (const w of [...FLUID, ...FLOORED]) rows.push({ 视口: w, ...(await measure(w)) })
await browser.close()

for (const r of rows) r.留白占比 = Math.round((r.void / r.inner) * 1000) / 10
console.table(rows.map((r) => ({ 视口: r.视口, 包含块: r.inner, 内容列: r.column, 留白: r.void, '留白%': r.留白占比 })))

const fluid = rows.filter((r) => FLUID.includes(r.视口)).map((r) => r.留白占比)
const spread = Math.max(...fluid) - Math.min(...fluid)
const floored = rows.filter((r) => FLOORED.includes(r.视口))

const fail = []
if (spread > TOLERANCE) {
  fail.push(`SC-001：${FLUID.join('/')} 三档的留白占比极差 ${spread.toFixed(1)} 个百分点，超过 ${TOLERANCE}`)
}
for (const r of floored) {
  if (r.column !== 960) fail.push(`FR-004：视口 ${r.视口} 下内容列是 ${r.column}px，地板要求 960`)
}

if (fail.length) {
  console.error('\n✗ ' + fail.join('\n✗ '))
  process.exit(1)
}
console.log(`\n✓ 留白占比极差 ${spread.toFixed(1)} 个百分点（容差 ${TOLERANCE}）；地板档内容列均为 960px`)
