import { useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { FieldDefinitionRow, FieldGroupRow, ProductModelRow, VendorRow } from "@/lib/metaTypes"
import type { ListPage } from "@/features/metadata/CrudPage"
import { tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { StateBoundary } from "@/components/StateBoundary"
import { PageHeader } from "@/features/common/PageHeader"
import { MasterDetail } from "@/features/common/MasterDetail"
import { useMasterSelection } from "@/features/common/useMasterSelection"
import { useFoldable } from "@/features/common/useFoldable"
import { Rail } from "@/features/common/Rail"
import { RailHeading, RailRow } from "@/features/common/RailRow"
import { TreePager } from "@/features/common/TreePager"
import { clampPage, pageCount, pageOfRoots } from "@/features/common/rootPaging"
import { fieldTreeRows, searchFieldRows } from "@/features/fields/fieldRows"
import { FieldDetail } from "@/features/fields/FieldDetail"
import { GroupDetail } from "@/features/fields/GroupDetail"
import { FieldEditor } from "@/features/fields/FieldEditor"
import { GroupEditor } from "@/features/fields/GroupEditor"
import { FieldCreateDialog } from "@/features/fields/FieldCreateDialog"
import { GroupCreateDialog } from "@/features/fields/GroupCreateDialog"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/** Groups per page of the rail. A page is N groups and their fields. */
const GROUPS_PER_PAGE = 8

/**
 * Fields and the groups they are gathered into, on one page.
 *
 * They were two tabs. A group is a handful of fields, so "what is in this
 * group" and "which groups is this field in" are two halves of one fact, and
 * each half used to live where the other could not be seen.
 *
 * A field appears under every group it belongs to, because it belongs to every
 * one of them -- `field_group_members` is many-to-many. Selection names the
 * field rather than the row, so all of its copies light up together and the
 * repetition becomes the answer to "which groups is this in".
 */
export function Fields() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get("q") ?? ""
  const setSearch = (q: string) => {
    const next = new URLSearchParams(searchParams)
    if (q) next.set("q", q)
    else next.delete("q")
    setSearchParams(next, { replace: true })
  }
  const [page, setPage] = useState(0)
  const [editingField, setEditingField] = useState<FieldDefinitionRow | null>(null)
  const [editingGroup, setEditingGroup] = useState<FieldGroupRow | null>(null)
  const [creating, setCreating] = useState<"field" | "group" | null>(null)
  const { deniedReason } = usePermissions()
  const folds = useFoldable()

  const fields = useQuery({
    queryKey: ["fields", "all"],
    queryFn: () => api.get<ListPage<FieldDefinitionRow>>("/fields?limit=500"),
  })
  const groups = useQuery({
    queryKey: ["field-groups", "all"],
    queryFn: () => api.get<ListPage<FieldGroupRow>>("/field-groups?limit=500"),
  })
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
  })

  const fieldList = fields.data?.items ?? []
  const groupList = groups.data?.items ?? []
  const searching = search.trim() !== ""

  // Paged by group, so a field is never shown without the group it sits under.
  const at = clampPage(page, groupList.length, GROUPS_PER_PAGE)
  const rows = searching
    ? searchFieldRows({ groups: groupList, fields: fieldList }, search)
    : fieldTreeRows({
        groups: pageOfRoots(groupList, at, GROUPS_PER_PAGE),
        fields: fieldList,
        isFolded: folds.isFolded,
      })

  // Everything selectable, not just what this page of the rail is showing:
  // the selection comes from the address, and paging away from something does
  // not stop it being what you are looking at.
  const selection = useMasterSelection(
    [...groupList.map((g) => g.id), ...fieldList.map((f) => f.id)],
    id,
  )
  const currentGroup = groupList.find((g) => g.id === selection.current) ?? null
  const currentField = fieldList.find((f) => f.id === selection.current) ?? null
  const denied = deniedReason("schema.manage")

  return (
    <div>
      <PageHeader title={tMeta.fields.title} hint={tMeta.fields.emptyHint} />

      <div className="mt-14">
        <StateBoundary
          isLoading={fields.isLoading || groups.isLoading}
          error={(fields.error ?? groups.error) as Error | null}
          onRetry={() => {
            fields.refetch()
            groups.refetch()
          }}
        >
          <MasterDetail
            selected={Boolean(id)}
            list={
              <Rail
                searchID="fp-search"
                searchHint={tMeta.fields.searchHint}
                search={search}
                onSearch={(q) => {
                  setSearch(q)
                  setPage(0)
                }}
                pager={
                  searching ? null : (
                    <TreePager
                      page={at}
                      pageCount={pageCount(groupList.length, GROUPS_PER_PAGE)}
                      onPage={setPage}
                    />
                  )
                }
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground flex-1 rounded-full"
                      disabled={Boolean(denied)}
                      title={denied ?? undefined}
                      onClick={() => setCreating("field")}
                    >
                      + {tMeta.fields.create}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground flex-1 rounded-full"
                      disabled={Boolean(denied)}
                      title={denied ?? undefined}
                      onClick={() => setCreating("group")}
                    >
                      + {tMeta.fieldGroups.create}
                    </Button>
                  </>
                }
              >
                {rows.map((r, i) =>
                  r.kind === "ungrouped" ? (
                    <li key="ungrouped">
                      <RailHeading>{tMeta.panes.ungrouped}</RailHeading>
                    </li>
                  ) : (
                    <li key={`${r.kind}-${r.id}-${i}`}>
                      <RailRow
                        to={`/fields/${r.id}`}
                        label={r.label}
                        count={r.count}
                        depth={r.depth}
                        // Every copy of a field lights up: the address names
                        // the field, not the row it was reached through.
                        selected={r.id === selection.current}
                        folded={
                          r.kind === "group" && !searching
                            ? folds.isFolded(r.id, r.count ?? 0)
                            : undefined
                        }
                        onFold={() => folds.toggle(r.id, r.count ?? 0)}
                        foldLabel={
                          folds.isFolded(r.id, r.count ?? 0)
                            ? tMeta.panes.unfold
                            : tMeta.panes.fold
                        }
                      />
                    </li>
                  ),
                )}
              </Rail>
            }
            detail={
              fieldList.length === 0 && groupList.length === 0 ? null : currentGroup ? (
                <GroupDetail
                  key={currentGroup.id}
                  group={currentGroup}
                  fields={fieldList}
                  onEdit={() => setEditingGroup(currentGroup)}
                />
              ) : currentField ? (
                <FieldDetail
                  key={currentField.id}
                  field={currentField}
                  groups={groupList}
                  categories={categories.data ?? []}
                  models={Array.isArray(models.data) ? models.data : []}
                  vendors={Array.isArray(vendors.data) ? vendors.data : []}
                  onEdit={() => setEditingField(currentField)}
                />
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {selection.missing ? tMeta.panes.notFound : tMeta.fields.empty}
                    </EmptyTitle>
                    <EmptyDescription>
                      {selection.missing ? tMeta.panes.notFoundHint : tMeta.fields.emptyHint}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            }
          />
        </StateBoundary>
      </div>

      {editingField && (
        <FieldEditor field={editingField} onClose={() => setEditingField(null)} />
      )}
      {editingGroup && (
        <GroupEditor group={editingGroup} onClose={() => setEditingGroup(null)} />
      )}
      {creating === "field" && <FieldCreateDialog onClose={() => setCreating(null)} />}
      {creating === "group" && <GroupCreateDialog onClose={() => setCreating(null)} />}
    </div>
  )
}
