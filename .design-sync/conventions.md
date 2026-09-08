## Building with Nexus Assets

An internal asset ledger: people track company devices, move them between
holders, and print labels for them. Screens are dense, read down a column, and
written in Chinese. The look is **Organic** — a warm cream ground, terracotta
for actions, generous corners on boxes and pills on everything small.

### Two components need a wrapper; the rest do not

`StatusBadge`, `Timeline` and `CrudPage` resolve status keys through a React
Query cache, and `MetadataTabs` renders router links. Outside a provider each of
those throws. Everything else — every `components/ui` primitive, `PageHeader`,
`StatCard`, `DistributionBar`, `Pager`, `ListToolbar` — is pure props and needs
nothing.

```jsx
const client = new QueryClient()
client.setQueryData(["statuses"], [
  { key: "in_stock",    label: "在库",   color: "green" },
  { key: "checked_out", label: "已签出", color: "blue"  },
  { key: "repairing",   label: "维修中", color: "amber" },
  { key: "lost",        label: "丢失",   color: "red"   },
  { key: "retired",     label: "已报废", color: "slate" },
])
<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
```

Seed it, don't let it fetch: an unseeded query never resolves and every status
renders as its raw key.

### The styling idiom: semantic Tailwind classes, never raw colour

Components already carry their own look. For your own layout glue, use the
**semantic** classes — never a hex value, never a palette shade:

| Ground | `bg-background` (page) · `bg-card` (raised) · `bg-well` (sunk, e.g. table headers) · `bg-muted` |
| Text | `text-foreground` · `text-muted-foreground` (secondary) · `text-primary-foreground` (on terracotta) |
| Action | `bg-primary` · `text-primary` · `bg-accent` + `text-accent-foreground` (hover) |
| Danger | `bg-destructive` · `text-destructive` |
| Lines | `border-border` (around things) · `border-border-muted` (between rows) |
| Quantity | `bg-accent-2` — sage. For bars and counts. Never for an action or a status. |

Focus rings belong to the components and are already correct — an opaque
terracotta at 3:1 against every ground in the palette. Do not draw your own.

**Colour means status in this product.** Eight `.status-*` palettes are what an
administrator configures, so never reach for green or red to mean "good" or
"bad" in your own markup — a green block beside a real status chip is borrowing
a meaning it does not have. Use `bg-accent-2` for quantity, and text plus shape
for everything else.

Radii come in two kinds and are not on one scale. Boxes — cards, dialogs,
panels — use `rounded-lg` (28px), with `rounded-md` (16px) for
mid-sized surfaces and `rounded-sm` (8px) for things inset in something else.
**Small controls are pills**: buttons, inputs, selects, tabs, toggles and badges
all say `rounded-full`. A textarea is the exception — a 999px corner cuts into
its first and last line, so one inside an `InputGroup` needs `rounded-xl` to
escape the group's pill. Note `rounded-lg` and `rounded-xl` are both 28px here,
and `rounded-2xl` / `rounded-3xl` do not exist: this is three named radii, not a
scale.

Type is Caprasimo for page titles (`font-heading`, one weight — never ask for
bold), Figtree for everything else, Noto Sans SC for Chinese. Numbers that sit
in a column get `tabular-nums`.

### Rules a screen is judged against

- **Forms are `Field` / `FieldGroup` / `FieldSet`** — not `div + Label`, and not
  `Form`. `Form` exists in the bundle but nothing in this product uses it.
- **A hint with an input goes in the placeholder.** Things that must stay
  visible — a refusal, a consequence, a statement of current state — get
  `FieldError`, an `Alert`, or a `FieldDescription`. Everything else hangs off a
  `Hint` question mark.
- **Tables: the row is the click target, and nothing clickable goes in a cell.**
  A control inside a cell fires with the row and one click gives two results.
  Row actions belong in a right-click `ContextMenu` or a hover strip at the
  row's end that stops propagation.
- **The pager is one row below the table** — range, pages, per-page.
- **Unavailable actions are disabled, never hidden.** Someone who cannot see an
  action cannot learn it exists.
- **Empty is a state, not a blank rectangle.** Say what would fill it, and if a
  filter emptied it, offer to clear the filter.
- **Every icon-only button carries an `aria-label`.**
- **Icons are inline `<svg>`, never a glyph in a `<span>`.** Several components
  lay themselves out with `has-[>svg]` — `Alert` starts at `grid-cols-[0_1fr]`
  and only opens its first column for a real `svg`, so a `<span>` icon lands in
  a zero-width column and is clipped away.
- There is one light theme. No `dark:` classes — they resolve to nothing.

### Where the truth is

`styles.css` and its imports carry every token; `components/<group>/<Name>/<Name>.d.ts`
is the real prop contract, and `<Name>.prompt.md` sits beside it. Read those
before guessing at an API. Note the contracts are incomplete in one direction
only: event handlers are absent, and so are some behaviour props (`Calendar`'s
`mode` and `selected`, for instance). Those pass through to the Radix or
react-day-picker component underneath and work. A prop missing from a contract
is not evidence against it; a prop present in one is real.

### A screen, idiomatically

```jsx
<div className="grid gap-6">
  <PageHeader title="资产" hint="含子类别，不含已报废">
    <Button variant="outline">导出 CSV</Button>
    <Button>录入设备</Button>
  </PageHeader>
  <ListToolbar q={q} onQ={setQ} searchHint="搜索资产" />
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow><TableHead>资产编号</TableHead><TableHead>状态</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="cursor-pointer">
          <TableCell className="font-mono">2199023255611</TableCell>
          <TableCell><StatusBadge status="repairing" /></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </TableFrame>
  <Pager page={0} pageSize={20} total={137} onPage={setPage} onPageSize={setSize} />
</div>
```
