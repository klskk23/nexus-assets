import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { DownloadSimple, Printer, Trash } from "@phosphor-icons/react"

import { api, ApiError } from "@/lib/api"
import { t, tImport, tTransfer } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import {
  TransferDialog,
  type TransferAction,
} from "@/features/transfers/TransferDialog"
import { Button } from "@/components/ui/button"
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

/** The three movements the bar names directly (handoff §3). */
const QUICK: TransferAction[] = ["checkout", "checkin", "transfer"]

/**
 * The bar that rises once rows are ticked.
 *
 * One row, at the height of the buttons it holds: it floats over the table it
 * is about, so every extra line of it is a line of the table nobody can read.
 *
 * It composes nothing itself. Each transfer button opens the shared dialog
 * with that action preselected, so the list page and the detail page cannot
 * end up behaving differently for the same operation.
 *
 * Handoff §3: a floating panel in the dialog's own dress -- surface, the top
 * elevation, 14px corners, 8px 8px 8px 16px inside -- fixed 22px above the
 * bottom. "已选 N 台" in the accent's 300 step; the three movements, the
 * label and the export as 30px secondary buttons; delete as the red ghost;
 * clear as a muted ghost at the end. The three verbs are back on the bar
 * because the prototype draws them there (decision 215); the dialog they open
 * still asks, and the other two actions are still reachable through it.
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
    /* z-20 because the table's pinned columns carry an opaque background and a
     * stacking order of their own; without it the bar was painted over by the
     * very rows it floats above. */
    <div className="sticky bottom-[22px] z-20 flex justify-center">
      <div className="bg-card flex flex-wrap items-center gap-1.5 rounded-lg py-2 pr-2 pl-4 shadow-lg">
        <span className="text-accent-300 mr-1.5 text-[13px] whitespace-nowrap">
          {tTransfer.actions.selected(selected.length)}
        </span>

        {QUICK.map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            size="sm"
            disabled={deniedReason("transfer.create") !== undefined}
            title={deniedReason("transfer.create")}
            onClick={() => {
              setAction(kind)
              setOpen(true)
            }}
          >
            {tTransfer.kind[kind]}
          </Button>
        ))}

        {/* Printing is a property of the installation: with no print service
            configured there is no button, rather than one that answers "not
            configured" after it is pressed. */}
        {printing && (
          <Button
            variant="secondary"
            size="sm"
            disabled={deniedReason("print") !== undefined}
            title={deniedReason("print")}
            onClick={() => setPrintOpen(true)}
          >
            <Printer />
            {t.print.action}
          </Button>
        )}

        <Button
          variant="secondary"
          size="sm"
          disabled={deniedReason("export") !== undefined}
          title={deniedReason("export")}
          onClick={onExport}
        >
          <DownloadSimple />
          {tImport.exportSelection}
        </Button>

        {/* Destructive and the only one here that cannot be undone. Red as
            text and outline, like every red on this ground -- the surface it
            sits on is the same as a dialog's, so the rule that applies to a
            dialog's delete applies here. (022's inverted pill on a dark bar is
            gone with the bar it was inverted against.) */}
        <ConfirmDialog
          trigger={
            <Button
              variant="destructive"
              size="sm"
              disabled={deniedReason("asset.delete") !== undefined}
              title={deniedReason("asset.delete")}
            >
              <Trash />
              {t.assets.delete}
            </Button>
          }
          title={t.assets.deleteTitle}
          description={t.assets.deleteManyHint(selected.length)}
          confirmLabel={t.assets.delete}
          tone="danger"
          // A batch cannot ask for every number to be typed out, so it asks
          // for its size: you cannot confirm without having looked at it.
          requirePhrase={String(selected.length)}
          onConfirm={() => remove.mutate()}
        />

        <Button variant="ghost" size="sm" className="text-neutral-400" onClick={onClear}>
          {tTransfer.actions.clear}
        </Button>
      </div>

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
    </div>
  )
}
