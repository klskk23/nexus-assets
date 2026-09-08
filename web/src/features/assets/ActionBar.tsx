import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import { t, tImport, tTransfer } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import {
  TransferDialog,
  type TransferAction,
} from "@/features/transfers/TransferDialog"
import { DownloadIcon, PrinterIcon } from "lucide-react"
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
/** An outlined pill on the dark bar. Transparent, so the bar shows through. */
const PILL =
  "border-background/35 text-background hover:bg-background/15 rounded-full border bg-transparent"

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
    /* A dark pill floating over the table, centred, rather than a full-width
     * card. It is the one thing on this page that has to be found instantly
     * while a list of forty rows scrolls behind it, and this palette's four
     * grounds are all within 1.22:1 of each other -- none of them can carry
     * that. --foreground can, and it is already in the palette.
     *
     * z-20 because the table's pinned columns carry an opaque background and a
     * stacking order of their own; without it the bar was painted over by the
     * very rows it floats above.
     *
     * Four actions, not eight. The five transfer verbs used to sit here as
     * five buttons, which is a menu spelled out along a bar -- the dialog they
     * open asks which one anyway, so it asks there. What is left is the four
     * things you do to a batch: move it, label it, take it away, delete it. */
    <div className="sticky bottom-6 z-20 flex justify-center">
      <div className="bg-foreground text-background flex flex-wrap items-center gap-1.5 rounded-full py-2 pr-2 pl-5 shadow-lg">
        <span className="mr-1 text-sm whitespace-nowrap">
          {tTransfer.actions.selected(selected.length)}
        </span>

        <Button size="sm" className={PILL} onClick={onClear}>
          {tTransfer.actions.clear}
        </Button>

        <Button
          size="sm"
          className={PILL}
          disabled={deniedReason("transfer.create") !== undefined}
          title={deniedReason("transfer.create")}
          onClick={() => {
            setAction(null)
            setOpen(true)
          }}
        >
          {tTransfer.actions.title}
        </Button>

        <Button
          size="sm"
          className={PILL}
          disabled={deniedReason("export") !== undefined}
          title={deniedReason("export")}
          onClick={onExport}
        >
          <DownloadIcon />
          {tImport.exportSelection}
        </Button>

        {/* Destructive, and the only one here that cannot be undone -- but it
            does NOT wear --destructive, and that is deliberate.

            This bar's ground is --foreground. Clay measures 2.53:1 on it and
            the red it replaced measured 3.48 -- neither clears 4.5, so the old
            button was already failing and switching the token would only have
            made it worse. The design covers light grounds; this pill is the one
            dark surface in the product and it was never drawn.

            So the button follows the rule the rest of this bar already
            follows -- invert against the ground -- and gets its danger from the
            bin and the word, which is where the meaning was anyway. Inverted it
            measures 15.17:1.

            **This is the only destructive action in the product that is not
            destructive-coloured.** It looks like an oversight. It is not: see
            022 FR-020 and docs/rules/web-tables.md. */}
        <ConfirmDialog
          trigger={
            <Button
              size="sm"
              className={PILL}
              disabled={deniedReason("asset.delete") !== undefined}
              title={deniedReason("asset.delete")}
            >
              <Trash2Icon />
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

        {/* Printing is a property of the installation: with no print service
            configured there is no button, rather than one that answers "not
            configured" after it is pressed. It is the primary act here --
            a batch is usually selected in order to label it. */}
        {printing && (
          <Button
            size="sm"
            className="rounded-full"
            disabled={deniedReason("print") !== undefined}
            title={deniedReason("print")}
            onClick={() => setPrintOpen(true)}
          >
            <PrinterIcon />
            {t.print.action}
          </Button>
        )}
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
