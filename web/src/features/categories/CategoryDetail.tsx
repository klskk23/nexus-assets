import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category, CategorySchema } from "@/lib/types"
import { t, tConfig, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Hint } from "@/features/common/Hint"
import { TableFrame } from "@/features/common/TableFrame"
import { usePresets, usePrinting } from "@/features/print/usePrinting"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Props {
  category: Category
  categories: Category[]
  /** Devices in this category and everything under it. */
  count: number
  onEdit: () => void
}

/**
 * Everything one category is configured to be, in one read.
 *
 * This is the point of the whole page. The same facts were only ever visible
 * inside the edit dialog, so answering "what does this category record" meant
 * opening and closing a dialog per category -- and comparing two of them meant
 * doing it twice from memory, because a dialog hides the tree behind it.
 *
 * Read-only, deliberately. Editing is one button away in the dialog that
 * already does it, and deleting stays in there too: switching category here
 * costs one click, so a destructive control on a pane that changes under you
 * that easily is a worse trade than one extra click.
 */
export function CategoryDetail({ category, categories, count, onEdit }: Props) {
  const { deniedReason } = usePermissions()
  const printing = usePrinting()
  const presets = usePresets(printing.enabled)

  const schema = useQuery({
    queryKey: ["category-schema", category.id],
    queryFn: () => api.get<CategorySchema>(`/categories/${category.id}/schema`),
  })
  const bound = schema.data?.fields ?? []
  const nameOf = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.name ?? ""
  const denied = deniedReason("schema.manage")

  // Falls back to the raw id when the print service cannot be reached: the
  // category really does carry that label, and blanking it would say it does
  // not. Same shape the editor already uses for an unreachable service.
  const presetNames = (category.print_preset_ids ?? []).map(
    (id) => (presets.data?.presets ?? []).find((p) => p.id === id)?.name ?? id,
  )

  return (
    <div className="bg-well grid gap-6 rounded-[28px] px-7 py-6">
      {/* Only where the two panes cannot both be on screen. On a narrow screen
          they are two pages, so this is the way back to the list -- and it is
          a link to the list's own address, so the browser's Back agrees with
          it instead of competing. */}
      <Link
        to="/categories"
        className="text-muted-foreground hover:text-foreground -mb-2 text-sm md:hidden"
      >
        ← {tMeta.categories.title}
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[26px] leading-tight font-bold">{category.name}</h2>
        <span className="text-muted-foreground font-heading text-sm">{category.code}</span>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={onEdit}
          disabled={Boolean(denied)}
          title={denied ?? undefined}
        >
          {tMeta.categories.edit}
        </Button>
      </div>

      <dl className="bg-card grid gap-5 rounded-[20px] px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* The parent is a name, not a link. The tree is right there and
            already selects; a second way to move that looks different from
            the first is two things to learn. */}
        <Fact label={tMeta.categories.parent}>
          {category.parent_id ? nameOf(category.parent_id) : tMeta.categories.noParent}
        </Fact>
        {/* codeShort, not code: that one is a form label carrying its own
            hint in brackets, and a hint read as a column heading is noise. */}
        <Fact label={tMeta.categories.codeShort}>
          <span className="font-mono text-[13px]">{category.code}</span>
        </Fact>
        <Fact label={tMeta.categories.displayKey}>
          {category.display_key || (
            <span className="text-muted-foreground">{tConfig.displayKey.none}</span>
          )}
        </Fact>
        <Fact label={tMeta.categories.printPreset}>
          {presetNames.length > 0 ? (
            presetNames.join("、")
          ) : (
            <span className="text-muted-foreground">
              {printing.enabled ? t.common.none : tMeta.categories.printPresetOffline}
            </span>
          )}
        </Fact>
      </dl>

      {/* The number in the tree says how many; this says where to go and see
          them. Descendants included, exactly as the overview's distribution
          links -- the same category reached two ways must not produce two
          different lists. */}
      <Link
        to={`/assets?category_id=${category.id}&include_descendants=true`}
        className="text-primary justify-self-start text-sm font-semibold hover:underline"
      >
        {tMeta.categories.seeAssets(count)}
      </Link>

      <div className="grid gap-2.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[21px] font-bold">{tMeta.categories.fields}</h3>
          <Hint>{tMeta.categories.bindElsewhere}</Hint>
        </div>

        {schema.isLoading ? (
          <Skeleton className="h-24 w-full rounded-[20px]" />
        ) : bound.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{tMeta.categories.noFields}</EmptyTitle>
              <EmptyDescription>{tMeta.categories.bindElsewhere}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tMeta.fields.label}</TableHead>
                  <TableHead>{tMeta.fields.key}</TableHead>
                  <TableHead>{tMeta.fields.type}</TableHead>
                  <TableHead>{tMeta.categories.required}</TableHead>
                  <TableHead>{tMeta.categories.inheritedFrom}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bound.map((f) => (
                  <TableRow key={f.key} aria-label={f.label}>
                    <TableCell>{f.label}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-[13px]">
                      {f.key}
                    </TableCell>
                    <TableCell>{tMeta.fieldTypes[f.type] ?? f.type}</TableCell>
                    <TableCell>
                      {f.required ? (
                        <Badge variant="outline">{tMeta.categories.required}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {f.inherited_from ? (
                        <Badge variant="secondary">{nameOf(f.inherited_from)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground mb-1 text-[13px]">{label}</dt>
      <dd className="text-[15px]">{children}</dd>
    </div>
  )
}
