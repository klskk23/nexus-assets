import { useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { tConfirm } from "@/i18n"

interface Props {
  /** The control that opens the dialog. */
  trigger: ReactNode
  title: string
  description: string
  confirmLabel: string
  /**
   * When set, the action stays disabled until the person types this exact
   * value. Reserved for changes that cannot be undone -- reading a warning is
   * easy to do without noticing; typing a serial number is not.
   */
  requirePhrase?: string
  phraseLabel?: string
  onConfirm: () => void
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  requirePhrase,
  phraseLabel,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("")
  const [open, setOpen] = useState(false)

  const armed = requirePhrase === undefined || typed === requirePhrase

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTyped("")
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {requirePhrase !== undefined && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-phrase">
              {phraseLabel ?? tConfirm.typeToConfirm(requirePhrase)}
            </Label>
            <Input
              id="confirm-phrase"
              className="font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{tConfirm.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!armed}
            onClick={() => {
              if (armed) onConfirm()
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
