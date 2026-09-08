/**
 * Measures the content column against the panel it sits in, at several widths.
 *
 *   node specs/020-fluid-content-column/measure.mjs
 *
 * This cannot live in vitest: jsdom does no layout, so getBoundingClientRect()
 * returns zeroes and any assertion about a width or a proportion would pass
 * whatever the CSS said.
 *
 * **What it asserts changed on 2026-09-08 (决策 135).** 020 shipped a column at
 * 76% of the panel and this script checked that the 24% void held steady across
 * widths -- it did, and the void was still the problem: 581px of nothing at
 * 2560. The column now fills the panel, so the acceptance is that there is no
 * void at all, at any width, and that what separates content from the screen is
 * the panel's padding -- a constant, not a share.
 *
 * Still written to FAIL, which is the point. Give the column any width rule --
 * a max-width, a percentage, the old min(100%, max(960px, 76%)) -- and `void`
 * goes non-zero at the wide end and the script exits 1. That check is a step in
 * the task list, not an afterthought: a layout assertion that was only ever
 * seen passing is not evidence of anything.
 *
 * Needs the walkthrough instance running (see quickstart.md).
 */
import { chromium } from '../../.ds-sync/node_modules/playwright/index.mjs'

const BASE = process.env.NEXUS_URL ?? 'http://localhost:8818'
const EMAIL = process.env.NEXUS_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.NEXUS_PASSWORD ?? 'devpass018x'

/** Every width answers the same way now, so there is one list. */
const WIDTHS = [3840, 2560, 1920, 1440, 1366]
/**
 * main's pr-10 plus the well gutter the panel sits in (p-3).
 * The one number the layout still owes the right-hand edge.
 */
const EDGE = 40 + 12

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
    // The containing block is the panel's content box, not its border box.
    const inner =
      main.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    const box = col.getBoundingClientRect()
    return {
      inner: Math.round(inner),
      column: Math.round(box.width),
      void: Math.round(inner - box.width),
      edge: Math.round(window.innerWidth - box.right),
    }
  })
}

const rows = []
for (const w of WIDTHS) rows.push({ 视口: w, ...(await measure(w)) })
await browser.close()

console.table(
  rows.map((r) => ({ 视口: r.视口, 包含块: r.inner, 内容列: r.column, 留白: r.void, 距屏幕右缘: r.edge })),
)

const fail = []
for (const r of rows) {
  // One pixel of slack: a fractional panel width rounds, and a 1px difference
  // is not a layout rule -- 020's 76% showed up here as hundreds.
  if (Math.abs(r.void) > 1) {
    fail.push(`视口 ${r.视口}：内容列 ${r.column}px 之外还剩 ${r.void}px 留白，应当铺满包含块 ${r.inner}px`)
  }
  if (Math.abs(r.edge - EDGE) > 1) {
    fail.push(`视口 ${r.视口}：内容右缘距屏幕 ${r.edge}px，应当恒为 ${EDGE}px（面板内边距 40 + 井槽 12）`)
  }
}

if (fail.length) {
  console.error('\n✗ ' + fail.join('\n✗ '))
  process.exit(1)
}
console.log(`\n✓ ${WIDTHS.length} 档窗口内容列均铺满包含块，右缘距屏幕恒为 ${EDGE}px`)
