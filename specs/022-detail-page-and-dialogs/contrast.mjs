/**
 * The destructive colour has to clear 4.5:1 everywhere it is actually used.
 *
 *   node specs/022-detail-page-and-dialogs/contrast.mjs
 *
 * Reads the tokens out of index.css rather than restating them, so the script
 * cannot drift from the sheet -- restating them is how a check ends up
 * measuring what it was told instead of what shipped.
 *
 * The last row is the one that matters. The bulk action bar's ground is
 * --foreground, and NEITHER the old red (3.48) nor the new clay (2.53) clears
 * 4.5 on it. The design only ever covered light grounds. That is why ActionBar
 * does not use the token at all -- it is checked here as its own row, against
 * whatever colour that button actually ends up with.
 */
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../../web/src/index.css', import.meta.url), 'utf8')

/** Pull a hex token out of the sheet. Fails loudly rather than defaulting. */
function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))
  if (!m) throw new Error(`index.css 里找不到十六进制的 --${name}`)
  return m[1]
}

function lum(hex) {
  const h = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const destructive = token('destructive')
const onDestructive = token('destructive-foreground')
const grounds = {
  background: token('background'),
  well: token('well'),
  card: token('card'),
}

const rows = []
for (const [name, bg] of Object.entries(grounds)) {
  rows.push({ 前景: destructive, 背景: `--${name} ${bg}`, 比值: +ratio(destructive, bg).toFixed(2) })
}
rows.push({
  前景: onDestructive,
  背景: `--destructive ${destructive}`,
  比值: +ratio(onDestructive, destructive).toFixed(2),
})

// The dark bulk bar. Its delete button must NOT be --destructive; whatever it
// is, it is measured against --foreground here.
const fg = token('foreground')
const barText = token('background') // the inverted pill's text colour
rows.push({ 前景: barText, 背景: `--foreground ${fg}（批量条）`, 比值: +ratio(barText, fg).toFixed(2) })

console.table(rows)

const fail = rows.filter((r) => r.比值 < 4.5)
if (fail.length) {
  console.error('\n✗ 未达 4.5:1：')
  for (const r of fail) console.error(`  ${r.前景} on ${r.背景} = ${r.比值}`)
  process.exit(1)
}
console.log(`\n✓ ${rows.length} 组全部 ≥4.5:1`)
