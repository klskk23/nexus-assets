import { AlertCircleIcon, PlusIcon } from "lucide-react"
import { Fragment, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api"
import { t } from "@/i18n"
import { cn } from "@/lib/utils"
import { StateBoundary } from "@/components/StateBoundary"
import { ListToolbar } from "@/features/common/ListToolbar"
import { PageHeader } from "@/features/common/PageHeader"
import { Pager } from "@/features/common/Pager"
import { useListQuery, type ListQuery } from "@/features/common/useListQuery"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { TableFrame } from "@/features/common/TableFrame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
}

/** One entry in a row's context menu. */
export interface RowAction<T> {
  label: string
  onSelect: (row: T) => void
  /** Renders in the destructive colour and sits below a separator. */
  destructive?: boolean
  disabled?: (row: T) => boolean
  /**
   * Asks before acting. The phrase is what the operator has to type, which is
   * how an irreversible action stays hard to do by accident -- reading a
   * warning is easy to do without noticing, typing a name is not.
   */
  confirm?: (row: T) => { title: string; description: string; phrase: string }
}

/** A page of rows, for the lists that are long enough to need one. */
export interface ListPage<T> {
  items: T[]
  total: number
}

interface Props<T> {
  title: string
  queryKey: string
  /**
   * One page of rows, given the search, the filters and the paging the toolbar
   * is holding. The plain-array shape is still accepted for a list that has no
   * page to give -- both because the endpoints answer either way, and because
   * a list of five statuses does not need a round trip to prove it is short.
   */
  list: (params: URLSearchParams) => Promise<T[] | ListPage<T>>
  /** What the search box searches, said plainly: "键名、显示名". */
  searchHint: string
  /**
   * The filters this page narrows by, keyed the way the API names them. The
   * value is the initial one, usually "" -- they are read back from the
   * address on load.
   */
  filterKeys?: Record<string, string>
  /** The filter controls themselves, rendered in the toolbar's one row. */
  filters?: (q: ListQuery) => ReactNode
  /** Anything belonging at the right end of the toolbar, such as a column picker. */
  toolbarActions?: ReactNode
  create: () => Promise<unknown>
  columns: Column<T>[]
  emptyTitle: string
  emptyHint: string
  createLabel: string
  createDisabled?: boolean
  /**
   * Why the create button is dead, when it is dead for want of a permission.
   *
   * Disabled and explained rather than hidden: a colleague who cannot see the
   * button has no way to learn the feature exists, let alone who can open it.
   * The rest of the row actions follow the same rule through `disabled`.
   */
  createDeniedReason?: string
  form: ReactNode
  /**
   * Shown above the table. This is where a failure from a row action belongs
   * -- disabling an account, moving the default stock marker -- since putting
   * it inside the create dialog would surface it where nobody is looking.
   */
  notice?: ReactNode
  /**
   * Opens the editor for a row. Given, the whole row becomes the control --
   * the same gesture the asset list uses, rather than a button in a column
   * that has to be aimed at.
   */
  onRowClick?: (row: T) => void
  /**
   * What right-clicking a row offers. Actions live here rather than in a
   * column of buttons: the buttons were competing with the data for width on
   * every screen, and most of them are used once a month.
   */
  rowActions?: RowAction<T>[]
  /**
   * Clears the form. Required rather than optional: the fields live on the
   * page, and a dialog that reopens holding the last thing you created is a
   * trap -- you edit one field, submit, and quietly create a near-duplicate.
   */
  onCreated: () => void
}

/**
 * The shared shape of the metadata pages: a form, a table, and the three states.
 *
 * They differ only in their columns and their form, so keeping the plumbing in
 * one place is what stops loading, empty and error handling from drifting apart
 * across five screens.
 */
export function CrudPage<T extends { id: string }>({
  title,
  queryKey,
  list,
  searchHint,
  filterKeys,
  filters,
  toolbarActions,
  create,
  columns,
  emptyTitle,
  emptyHint,
  createLabel,
  createDisabled,
  createDeniedReason,
  form,
  notice,
  onRowClick,
  rowActions,
  onCreated,
}: Props<T>) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  // A context menu closes as it fires, so a confirmation cannot hang off it.
  // The pending action is parked here and the dialog rendered outside.
  const [pending, setPending] = useState<{ action: RowAction<T>; row: T } | null>(null)
  const listQuery = useListQuery(filterKeys ?? {})
  const params = listQuery.params
  const query = useQuery({
    queryKey: [queryKey, params.toString()],
    queryFn: () => list(params),
    // The previous page stays on screen while the next one loads. Without it
    // every keystroke in the search box blanks the table, which reads as the
    // list having lost everything.
    placeholderData: (prev) => prev,
  })
  const rows = Array.isArray(query.data) ? query.data : (query.data?.items ?? [])
  const total = Array.isArray(query.data) ? query.data.length : (query.data?.total ?? 0)

  const mutation = useMutation({
    mutationFn: create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      setOpen(false)
      onCreated()
    },
  })

  return (
    <div className="grid gap-6">
      {/* Creating is occasional; the list is what the page is for. The form
          lives behind a button so the records get the screen. */}
      <PageHeader title={title}>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            // Dismissing without submitting also clears, so reopening is
            // always a blank form rather than a half-finished one.
            if (!next) {
              mutation.reset()
              onCreated()
            }
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={createDeniedReason !== undefined} title={createDeniedReason}>
              <PlusIcon data-icon="inline-start" />
              {createLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{createLabel}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4">
              {form}
              {mutation.error && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertDescription>
                    {mutation.error instanceof ApiError ? mutation.error.message : t.common.error}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t.common.cancel}</Button>
              </DialogClose>
              <Button
                onClick={() => mutation.mutate()}
                disabled={createDisabled || mutation.isPending}
              >
                {mutation.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                {mutation.isPending ? t.assets.saving : createLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {notice}

      {/* One row, the same on every page: search, this page's filters, and
          whatever belongs at the right end. */}
      <ListToolbar
        q={listQuery.q}
        onQ={listQuery.setQ}
        searchHint={searchHint}
        filters={filters?.(listQuery)}
        actions={toolbarActions}
      />

      <StateBoundary
        isLoading={query.isLoading}
        error={query.error as Error | null}
        isEmpty={query.isSuccess && rows.length === 0}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        onRetry={() => query.refetch()}
      >
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.header}>{c.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const cells = columns.map((c) => (
                  <TableCell key={c.header}>{c.cell(row)}</TableCell>
                ))
                const tr = (
                  <TableRow
                    key={row.id}
                    className={cn(onRowClick && "cursor-pointer")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {cells}
                  </TableRow>
                )
                if (!rowActions?.length) return tr
                return (
                  <ContextMenu key={row.id}>
                    <ContextMenuTrigger asChild>{tr}</ContextMenuTrigger>
                    <ContextMenuContent>
                      {rowActions.map((a, i) => (
                        <Fragment key={a.label}>
                          {a.destructive && i > 0 && <ContextMenuSeparator />}
                          <ContextMenuItem
                            variant={a.destructive ? "destructive" : "default"}
                            disabled={a.disabled?.(row)}
                            onSelect={() =>
                              a.confirm ? setPending({ action: a, row }) : a.onSelect(row)
                            }
                          >
                            {a.label}
                          </ContextMenuItem>
                        </Fragment>
                      ))}
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </TableBody>
          </Table>
        </TableFrame>
        <Pager
          page={listQuery.page}
          pageSize={listQuery.pageSize}
          total={total}
          onPage={listQuery.setPage}
          onPageSize={listQuery.setPageSize}
        />
      </StateBoundary>

      {pending?.action.confirm && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setPending(null)}
          title={pending.action.confirm(pending.row).title}
          description={pending.action.confirm(pending.row).description}
          confirmLabel={pending.action.label}
          requirePhrase={pending.action.confirm(pending.row).phrase}
          onConfirm={() => {
            pending.action.onSelect(pending.row)
            setPending(null)
          }}
        />
      )}
    </div>
  )
}
