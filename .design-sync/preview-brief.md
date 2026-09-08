# Preview authoring brief — nexus-assets design system sync

You are authoring preview cards for a component library being imported into
Claude Design. Each card you write is browsed by humans picking components, and
imitated by a design agent that builds real screens with them. A card that
renders wrong renders wrong in every design that agent ever builds.

Repo root: `/home/land/project/nexus-assets`. Work from there.

## What the design system is

`nexus-assets` is an internal asset ledger — a product for tracking company
devices. The component set is **shadcn/ui restyled in round 017 to the "Organic"
design language** (warm cream ground `#f5ead8`, terracotta primary `#c67139`,
sage second accent `#8fa073`, 28px card corners, **pill-shaped small controls**),
plus the parts this application added on top (page chrome, list plumbing,
overview cards).

UI text in this product is Chinese. Use realistic Chinese content from the
product's own vocabulary — 录入设备 / 导出 CSV / 在库 / 已签出 / 维修中 /
上海仓库 / 网络设备 / 资产编号 / 持有方 / 负责人 — never `foo`, `test`, or
`Lorem ipsum`.

## Your task

For **each component assigned to you**, write `.design-sync/previews/<Name>.tsx`.

- Named exports only. **Each named export is one card cell.** Budget 2–5 exports.
- Import from `"nexus-assets-web"`: `import { Button, Card } from "nexus-assets-web"`.
- No default export, no marker comment, no `<!-- -->` header. Plain TSX.
- **Use inline `style={{}}` for your own layout glue, not Tailwind classes.**
  The stylesheet a card loads is the *application's compiled CSS*, and Tailwind
  generates only the classes the application itself uses. `grid-cols-5`,
  `grid-cols-3`, `max-w-lg` and `max-w-md` do not exist and silently do nothing;
  `flex`, `grid`, `gap-2`, `gap-3`, `items-center`, `max-w-sm`, `text-sm`,
  `font-mono`, `tabular-nums`, `rounded-full` do. If you are unsure whether a
  class exists, grep `web/.ds-css/styles.css` for it -- or just write the style
  inline, which always works and is obviously scaffolding rather than a
  vocabulary the design agent should imitate.
  Also confirmed missing by a later batch: `max-w-xl`, `max-w-2xl`, `pb-2`, and
  **opacity modifiers on theme colours** (`bg-destructive/10` — the plain
  `text-destructive` does exist). The CSS custom properties themselves are all
  present, so the reliable way to reach a token is inline:
  `style={{ backgroundColor: "color-mix(in oklab, var(--destructive) 12%, transparent)" }}`.
  Also missing: every `min-h-*`, `w-52`, `w-60` (but `w-36/40/44/48/56/72` exist).

### The rule that matters most: compose sub-parts inside their parent

Most of your list is compound sub-parts (`DialogHeader`, `TableCell`,
`SelectItem`). **Rendered alone they are empty divs** — that is why they are
assigned to you together with their parent. A sub-part's preview is the **full
parent composition**, with that sub-part doing its real job. `TableCell.tsx`
renders a whole `<Table>` with rows; `DialogHeader.tsx` renders an open
`<Dialog>` with a header in it. That is the only render that is true anyway.

### A trigger inside a grid goes full-bleed

An overlay's root renders a fragment, so a `<Button>` used as its trigger is a
direct child of whatever you wrapped it in. Inside a `grid` that makes the
button full-width. Wrap the trigger in a plain `<div>` if you want it to size
to its content.

### The card frame does not paint the page background

The sheet's ground is white; the design system's `--background` is cream. So a
component that punches a hole in itself with `bg-background` — a labelled
separator, a notched border, a floating label — renders a tan chip that reads as
a highlight rather than as a gap. One line of glue fixes it:
`style={{ background: "var(--background)", padding: "1rem" }}` on the story's
wrapper.

### A submenu opened with `defaultOpen` closes itself — silently

When a menu mounts open it auto-focuses its parent content's first item, and
`MenuSubContent`'s `onFocusOutside` reads that as focus leaving the sub and
closes it. The parent renders, the flyout does not, and nothing errors. Fix:
`onOpenAutoFocus={(e) => e.preventDefault()}` on the **parent** `*Content`.
`forceMount` is not the fix — it mounts with `data-state="closed"` and this
design language's closed-state classes fade it away.

### Overlay components must be shown open

Dialogs, menus, popovers, tooltips: render them **open** (`open`,
`defaultOpen`), or the card is blank. If an open overlay escapes its card or
collapses, note it in your learnings file — the orchestrator sets
`cfg.overrides.<Name>: {"cardMode": "single", "viewport": "WxH"}`.

## Calibration findings — these already cost debugging cycles

1. **Domain keys must be real.** A transfer `kind` must be one of
   `create` `checkout` `checkin` `transfer` `reassign` `status_change`; a status
   key one of `in_stock` `checked_out` `repairing` `lost` `retired`; a status
   colour one of `slate green blue amber red violet teal rose`. An invented key
   falls through the catalogue and the badge renders the raw string — it looks
   like a bug in the component.
2. **No icon library is exported.** `lucide-react` is bundled but not exported,
   so `import { XIcon } from "nexus-assets-web"` fails. Use a unicode glyph or
   omit the icon — but **look at the glyph on the sheet before trusting it**.
   `⚠ ⓘ ✓ × ＋` render cleanly; `⌫` came out as an unreadable red hexagon and
   `⌸` as an ambiguous box in this font stack.
3. **Context is already provided.** Every card renders inside a wrapper holding
   a React Query client (seeded with the five real statuses) and a MemoryRouter.
   So `StatusBadge`, `Timeline` and router-linking components work — you do not
   need to wrap anything yourself.
4. **Read the contract before composing.** `ds-bundle/components/general/<Name>/<Name>.d.ts`
   carries the real props with their JSDoc. But it carries **no event handlers
   at all** — no `onSelect`, no `onOpenAutoFocus`. Those pass through to Radix
   and work, so a prop's absence from the contract is not evidence against it.
   Check Radix's API for behaviour props.
5. **Read the component's source** when the contract is not enough:
   `web/src/components/ui/<kebab-name>.tsx` or `web/src/features/**`.

## Commands you may run — and only these

```sh
node .ds-sync/lib/preview-rebuild.mjs --config .design-sync/config.json \
  --node-modules web/node_modules --out ./ds-bundle --components <YOURS>
DS_CHROMIUM_PATH=/usr/bin/google-chrome node .ds-sync/package-capture.mjs \
  --out ./ds-bundle --components <YOURS>
```

`<YOURS>` is your comma-separated list, always. **Never** run
`package-build.mjs`, `package-validate.mjs`, or `package-capture.mjs` unscoped —
they rewrite shared state and would corrupt every other agent's work in flight.

Watch the rebuild output for `! preview build failed: <Name>: <error>` — that
component silently falls back to a placeholder card until its `.tsx` compiles.

## Grade your own work

After capture, **Read** `ds-bundle/_screenshots/review/general__<Name>.png` for
each component — never grade a sheet you have not looked at this iteration —
and judge every cell on three things:

- **Styled**: the warm palette and real fonts are visibly applied. Browser-default
  text or an unstyled box means something is wrong.
- **Complete**: the composition renders whole. No missing children, no collapsed
  layout, no error text.
- **Plausible**: a designer would recognise it as a sensible use of the component.

Write `.design-sync/.cache/review/<Name>.grade.json`:

```json
{"cells": {"<ExportName>": {"verdict": "good", "note": "what it shows"}}}
```

Keys must equal the export names exactly. `needs-work` is an in-progress state,
not a final answer: fix the `.tsx`, rebuild, recapture, re-read, re-grade until
every cell is `good`.

## Files you may write

- `.design-sync/previews/<Name>.tsx` — only for components assigned to you
- `.design-sync/.cache/review/<Name>.grade.json` — only for yours
- `.design-sync/learnings/<BATCH_ID>.md` — your findings

**Do not touch** `.design-sync/config.json`, `.design-sync/NOTES.md`, or any
other agent's files. If a config change is needed (a provider, an override, a
CSS problem), write it in your learnings file for the orchestrator to apply.

**If the same root cause appears in two or more of your components — or even
once when it is config-level — stop on those and report it.** It is a global
issue, not something to work around per component.

## Report back

When done: components completed, total cells, anything you deferred and why,
and any config change the orchestrator needs to make.
