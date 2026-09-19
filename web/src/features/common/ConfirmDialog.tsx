import { Check, Copy } from "@phosphor-icons/react"
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
  /**
   * How much alarm this confirmation is entitled to. **Neutral by default.**
   *
   * The design only ever drew the delete case -- clay button, a bin in a
   * circle -- and it is tempting to make that the shape of every confirmation,
   * since AlertDialog is where confirmations live. But four of the thirteen
   * confirmations in this product are not destructive at all: saving a model,
   * recomputing a field, unbinding a field twice over, resetting a password.
   * Handing those a bin icon says the wrong thing about what is about to
   * happen, and a warning that appears on ordinary actions is a warning people
   * learn to click through.
   *
   * So the alarming shape is opt-in. `CrudPage` derives it from the
   * `RowAction.destructive` flag it already carries.
   */
  tone?: "danger" | "neutral"
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
  tone = "neutral",
  onConfirm,
}: Props) {
  const danger = tone === "danger"
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
      <AlertDialogContent tone={tone}>
        <AlertDialogHeader>
          {/* No mark (030): the prototype says "danger" with a 2px red edge
              down the panel's left side and a red-outlined verb, and nothing
              else. The edge is AlertDialogContent's, keyed on `tone`. */}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {requirePhrase !== undefined && (
          <div className="grid gap-2">
            {/* The phrase sits inside the sentence, in mono and selectable as
                one piece, with the copy verb at the row's end (handoff
                §弹窗 d09). The phrase is here to be read and retyped, but a
                serial number copied off a label by hand is a typo waiting to
                happen, and the dialog is not made safer by that. Copying it
                still costs a deliberate press on the thing being deleted. */}
            <div className="flex items-center gap-2">
              {/* The button sits beside the label, not inside it: a button
                  inside a label is one of the things the label labels. */}
              {/* block, not the Label's flex: the sentence has to flow as
                  prose around the code, not stand in three columns. */}
              <Label htmlFor="confirm-phrase" className="block min-w-0 flex-1 leading-snug">
                {phraseLabel ?? (
                  <>
                    {tConfirm.typeBefore}{" "}
                    <code ref={phraseRef} className="text-foreground font-mono select-all">
                      {requirePhrase}
                    </code>{" "}
                    {tConfirm.typeAfter}
                  </>
                )}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-neutral-400 h-auto px-1.5 py-px text-[11px]"
                aria-label={tConfirm.copyPhrase}
                onClick={async () => {
                  setCopied(await copyText(requirePhrase, phraseRef.current))
                }}
              >
                {copied === true ? <Check /> : <Copy />}
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
              className="font-mono text-[13px]"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{tConfirm.cancel}</AlertDialogCancel>
          <AlertDialogAction
            // AlertDialogAction defaults to the primary variant, so before
            // 022 the delete button was terracotta -- the same colour as
            // Save. Passing the variant is what actually makes a destructive
            // confirmation look destructive.
            variant={danger ? "destructive" : "default"}
            // The destructive variant is red text; the outline flag adds the
            // red border the prototype draws on a confirming verb.
            data-outline={danger ? "" : undefined}
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
