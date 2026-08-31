import { CheckIcon, CopyIcon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"

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
import { copyText } from "@/lib/clipboard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { tConfirm } from "@/i18n"

interface Props {
  /**
   * The control that opens the dialog. Omitted when the caller drives `open`
   * itself -- an action chosen from a context menu has no trigger to hang off,
   * because the menu has already closed by the time the dialog should appear.
   */
  trigger?: ReactNode
  /** Controlled mode. Both or neither. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
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
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requirePhrase,
  phraseLabel,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("")
  // null = not tried, true = on the clipboard, false = the browser would not,
  // and the text is selected so it can be copied by hand.
  const [copied, setCopied] = useState<boolean | null>(null)
  const phraseRef = useRef<HTMLElement>(null)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const armed = requirePhrase === undefined || typed === requirePhrase

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setTyped("")
          setCopied(null)
        }
      }}
    >
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
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
            {/* The phrase is here to be read and retyped, but a serial number
                copied off a label by hand is a typo waiting to happen, and the
                dialog is not made safer by that. Copying it still costs a
                deliberate press on the thing being deleted. */}
            <div className="flex items-center gap-2">
              <code
                ref={phraseRef}
                className="bg-muted rounded px-2 py-1 font-mono text-sm break-all"
              >
                {requirePhrase}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={tConfirm.copyPhrase}
                onClick={async () => {
                  setCopied(await copyText(requirePhrase, phraseRef.current))
                }}
              >
                {copied === true ? <CheckIcon /> : <CopyIcon />}
                {copied === true ? tConfirm.copied : tConfirm.copy}
              </Button>
            </div>
            {/* Reporting the failure rather than swallowing it: a button that
                does nothing reads as broken, which is exactly what it was. */}
            {copied === false && (
              <p className="text-muted-foreground text-xs">{tConfirm.copyFailed}</p>
            )}
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
