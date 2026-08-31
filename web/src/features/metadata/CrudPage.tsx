import { AlertCircleIcon, PlusIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api"
import { zh } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
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

interface Props<T> {
  title: string
  queryKey: string
  list: () => Promise<T[]>
  create: () => Promise<unknown>
  columns: Column<T>[]
  emptyTitle: string
  emptyHint: string
  createLabel: string
  createDisabled?: boolean
  form: ReactNode
  /**
   * Shown above the table. This is where a failure from a row action belongs
   * -- disabling an account, moving the default stock marker -- since putting
   * it inside the create dialog would surface it where nobody is looking.
   */
  notice?: ReactNode
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
  create,
  columns,
  emptyTitle,
  emptyHint,
  createLabel,
  createDisabled,
  form,
  notice,
  onCreated,
}: Props<T>) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const query = useQuery({ queryKey: [queryKey], queryFn: list })

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
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
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
            <Button className="ml-auto">
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
                    {mutation.error instanceof ApiError ? mutation.error.message : zh.common.error}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{zh.common.cancel}</Button>
              </DialogClose>
              <Button
                onClick={() => mutation.mutate()}
                disabled={createDisabled || mutation.isPending}
              >
                {mutation.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                {mutation.isPending ? zh.assets.saving : createLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {notice}

      <StateBoundary
        isLoading={query.isLoading}
        error={query.error as Error | null}
        isEmpty={query.data?.length === 0}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        onRetry={() => query.refetch()}
      >
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.header}>{c.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.header}>{c.cell(row)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </StateBoundary>
    </div>
  )
}
