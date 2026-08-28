import { useState } from "react"

import { zhTransfer } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  TransferDialog,
  transferActions,
  type TransferAction,
} from "@/features/transfers/TransferDialog"

interface Props {
  selected: string[]
  onClear: () => void
  onDone: (count: number) => void
}

/**
 * The bar that rises once rows are ticked.
 *
 * It composes nothing itself: each button opens the shared transfer dialog
 * with that action preselected, so the list page and the detail page cannot
 * end up behaving differently for the same operation.
 */
export function ActionBar({ selected, onClear, onDone }: Props) {
  const [action, setAction] = useState<TransferAction | null>(null)
  const [open, setOpen] = useState(false)

  if (selected.length === 0) return null

  return (
    <Card className="sticky bottom-4 shadow-lg">
      <CardContent className="flex flex-wrap items-center gap-2 pt-6">
        <span className="font-medium">{zhTransfer.actions.selected(selected.length)}</span>
        <div className="flex flex-wrap gap-1">
          {transferActions.map(([a, label]) => (
            <Button
              key={a}
              size="sm"
              variant="ghost"
              onClick={() => {
                setAction(a)
                setOpen(true)
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
          {zhTransfer.actions.clear}
        </Button>
      </CardContent>

      <TransferDialog
        assetIDs={selected}
        open={open}
        onOpenChange={setOpen}
        initialAction={action}
        onDone={(n) => {
          onDone(n)
          onClear()
        }}
      />
    </Card>
  )
}
