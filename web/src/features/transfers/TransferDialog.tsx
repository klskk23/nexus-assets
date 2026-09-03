import { t, tTransfer } from "@/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TransferForm, transferActions, type TransferAction } from "./TransferForm"

// Re-exported from here because this is where the two of them have always been
// imported from, and the list page's action bar reads better for it.
export { transferActions }
export type { TransferAction }

interface Props {
  assetIDs: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselects an action; the list page passes the button that was clicked. */
  initialAction?: TransferAction | null
  onDone: (count: number) => void
}

/**
 * A transfer composed over the list: several devices at once from the action
 * bar, or one from a row's context menu.
 *
 * The form itself lives in TransferForm, which the asset dialog shows expanded
 * rather than behind a button. Only the shell differs -- a batch of one is
 * still a batch, and the two surfaces must not drift apart.
 */
export function TransferDialog({ assetIDs, open, onOpenChange, initialAction, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tTransfer.actions.title}</DialogTitle>
          <DialogDescription>{tTransfer.actions.selected(assetIDs.length)}</DialogDescription>
        </DialogHeader>
        <TransferForm
          assetIDs={assetIDs}
          active={open}
          initialAction={initialAction}
          onDone={(n) => {
            onDone(n)
            onOpenChange(false)
          }}
          cancel={
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
