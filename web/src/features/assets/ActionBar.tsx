import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import { t, tImport, tTransfer } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import {
  TransferDialog,
  transferActions,
  type TransferAction,
} from "@/features/transfers/TransferDialog"
import { DownloadIcon, PrinterIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group"
import { Card, CardContent } from "@/components/ui/card"
import { PrintDialog } from "@/features/print/PrintDialog"
import { usePrinting } from "@/features/print/usePrinting"

interface Props {
  selected: string[]
  onClear: () => void
  onDone: (message: string) => void
  /** Opens the export dialog on these devices. Owned by the page, because the
   *  same dialog serves the toolbar and the row menu. */
  onExport: () => void
}

/**
 * The bar that rises once rows are ticked.
 *
 * One row, at the height of the buttons it holds: it floats over the table it
 * is about, so every extra line of it is a line of the table nobody can read.
 *
 * It composes nothing itself. Each transfer button opens the shared dialog
 * with that action preselected, so the list page and the detail page cannot
 * end up behaving differently for the same operation.
 */
export function ActionBar({ selected, onClear, onDone, onExport }: Props) {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [action, setAction] = useState<TransferAction | null>(null)
  const [open, setOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const { enabled: printing } = usePrinting()

  const remove = useMutation({
    mutationFn: () =>
      api.post<{ deleted: number }>("/assets/delete", {
        asset_ids: selected,
        confirm: String(selected.length),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      onDone(t.assets.deletedCount(res.deleted))
      onClear()
    },
    onError: (e) => onDone(e instanceof ApiError ? e.message : t.common.error),
  })

  if (selected.length === 0) return null

  return (
    // Card's own py-6 and gap-6 were adding 48px of nothing above and below a
    // single row of 32px buttons. The bar floats over the table it is about,
    // so every pixel of it is a pixel of the table nobody can read.
    <Card className="sticky bottom-4 gap-0 py-0 shadow-lg">
      <CardContent className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="text-sm font-medium">{tTransfer.actions.selected(selected.length)}</span>

        <ButtonGroup>
          {transferActions().map(([a, label]) => (
            <Button
              key={a}
              size="sm"
              variant="outline"
              disabled={deniedReason("transfer.create") !== undefined}
              title={deniedReason("transfer.create")}
              onClick={() => {
                setAction(a)
                setOpen(true)
              }}
            >
              {label}
            </Button>
          ))}
          {/* Printing is a property of the installation: with no print
              service configured there is no button, rather than one that
              answers "not configured" after it is pressed. */}
          {printing && (
            <Button
              size="sm"
              variant="outline"
              disabled={deniedReason("print") !== undefined}
              title={deniedReason("print")}
              onClick={() => setPrintOpen(true)}
            >
              <PrinterIcon data-icon="inline-start" />
              {t.print.action}
            </Button>
          )}
          {/* Exporting what was ticked, here rather than only in the header:
              the selection is what the bar is about, and going back up to a
              button that then asks "the ticked ones?" is a detour. */}
          <Button
            size="sm"
            variant="outline"
            disabled={deniedReason("export") !== undefined}
            title={deniedReason("export")}
            onClick={onExport}
          >
            <DownloadIcon data-icon="inline-start" />
            {tImport.exportSelection}
          </Button>
          <ButtonGroupSeparator />
          {/* Destructive, so it sits after a separator rather than in the run
              of transfer actions -- the same click distance, a different act. */}
          <ConfirmDialog
            trigger={
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={deniedReason("asset.delete") !== undefined}
                title={deniedReason("asset.delete")}
              >
                <Trash2Icon data-icon="inline-start" />
                {t.assets.delete}
              </Button>
            }
            title={t.assets.deleteTitle}
            description={t.assets.deleteManyHint(selected.length)}
            confirmLabel={t.assets.delete}
            // A batch cannot ask for every number to be typed out, so it asks
            // for its size: you cannot confirm without having looked at it.
            requirePhrase={String(selected.length)}
            onConfirm={() => remove.mutate()}
          />
        </ButtonGroup>

        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
          {tTransfer.actions.clear}
        </Button>
      </CardContent>

      <TransferDialog
        assetIDs={selected}
        open={open}
        onOpenChange={setOpen}
        initialAction={action}
        onDone={(n) => {
          onDone(tTransfer.actions.done(n))
          onClear()
        }}
      />
      {printOpen && <PrintDialog ids={selected} onClose={() => setPrintOpen(false)} />}
    </Card>
  )
}
