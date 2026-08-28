import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api"
import { zh } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
}: Props<T>) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: [queryKey], queryFn: list })

  const mutation = useMutation({
    mutationFn: create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  })

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">{title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{createLabel}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {form}
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error instanceof ApiError ? mutation.error.message : zh.common.error}
            </p>
          )}
          <div>
            <Button
              onClick={() => mutation.mutate()}
              disabled={createDisabled || mutation.isPending}
            >
              {mutation.isPending ? zh.assets.saving : createLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

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
