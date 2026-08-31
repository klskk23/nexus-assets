import { tMeta } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** One row of the editor. Kept as a list so blank and duplicate keys survive typing. */
export interface DefaultRow {
  key: string
  value: string
}

interface Props {
  rows: DefaultRow[]
  onChange: (rows: DefaultRow[]) => void
}

/**
 * Edits the default values a model offers.
 *
 * The state is a list rather than an object because a half-typed key is a
 * normal intermediate state: collapsing to an object would make two empty keys
 * collide and rows disappear under the cursor.
 *
 * Keys are not validated against any category. A model can serve categories
 * with different field sets, and a default is an offer rather than a promise --
 * one that does not apply is skipped when it is applied.
 */
export function AttrDefaultsEditor({ rows, onChange }: Props) {
  const setRow = (i: number, patch: Partial<DefaultRow>) =>
    onChange(rows.map((r, j) => (i === j ? { ...r, ...patch } : r)))

  return (
    <div className="grid gap-2">
      <Label>{tMeta.models.defaults}</Label>
      <p className="text-xs text-muted-foreground">{tMeta.models.defaultsHint}</p>

      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`ad-key-${i}`} className="text-xs">
              {tMeta.models.defaultKey}
            </Label>
            <Input
              id={`ad-key-${i}`}
              className="font-mono"
              value={r.key}
              onChange={(e) => setRow(i, { key: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`ad-value-${i}`} className="text-xs">
              {tMeta.models.defaultValue}
            </Label>
            <Input
              id={`ad-value-${i}`}
              value={r.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5"
            aria-label={`${tMeta.models.removeDefault} ${r.key || i + 1}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            {tMeta.models.removeDefault}
          </Button>
        </div>
      ))}

      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, { key: "", value: "" }])}
        >
          {tMeta.models.addDefault}
        </Button>
      </div>
    </div>
  )
}

/** Drops blank keys and collapses the rows into what the API expects. */
export function toAttrDefaults(rows: DefaultRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    const key = r.key.trim()
    if (key !== "") out[key] = r.value
  }
  return out
}
