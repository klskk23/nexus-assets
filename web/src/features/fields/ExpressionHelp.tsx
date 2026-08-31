import { HelpCircleIcon } from "lucide-react"

import { t, tExprHelp } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

/** A two-column row: the thing on the left, what it does on the right. */
function Row({ term, gloss }: { term: string; gloss: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,auto)_1fr] items-baseline gap-x-3 gap-y-0.5">
      <code className="text-foreground rounded bg-muted px-1.5 py-0.5 font-mono text-xs whitespace-nowrap">
        {term}
      </code>
      <span className="text-muted-foreground text-sm">{gloss}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

/**
 * What an expression can say, in a drawer beside the field being edited.
 *
 * A drawer rather than a dialog because it is read *while* writing: covering
 * the box you are typing in would make it a thing to memorise and dismiss
 * instead of a thing to glance at.
 */
export function ExpressionHelp() {
  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="ghost" size="sm" type="button">
          <HelpCircleIcon data-icon="inline-start" />
          {tExprHelp.open}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="w-full sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{tExprHelp.title}</DrawerTitle>
          <DrawerDescription>{tExprHelp.subtitle}</DrawerDescription>
        </DrawerHeader>

        <div className="grid gap-6 overflow-y-auto px-4 pb-4">
          <Section title={tExprHelp.readsTitle}>
            <div className="grid gap-1">
              {tExprHelp.reads.map(([term, gloss]) => (
                <Row key={term} term={term} gloss={gloss} />
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{tExprHelp.readsNote}</p>
          </Section>

          <Separator />

          <Section title={tExprHelp.examplesTitle}>
            <div className="grid gap-2">
              {tExprHelp.examples.map(([term, gloss]) => (
                <div key={term} className="grid gap-0.5">
                  <code className="text-foreground rounded bg-muted px-1.5 py-1 font-mono text-xs">
                    {term}
                  </code>
                  <span className="text-muted-foreground text-xs">{gloss}</span>
                </div>
              ))}
            </div>
          </Section>

          <Separator />

          <Section title={tExprHelp.pipeTitle}>
            <p className="text-muted-foreground text-sm">{tExprHelp.pipeBody}</p>
            <code className="text-muted-foreground rounded bg-muted px-1.5 py-1 font-mono text-xs">
              {tExprHelp.pipeExample}
            </code>
          </Section>

          <Separator />

          <Section title={tExprHelp.funcsTitle}>
            <div className="grid gap-1">
              {tExprHelp.funcs.map(([term, gloss]) => (
                <Row key={term} term={term} gloss={gloss} />
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{tExprHelp.funcsNote}</p>
          </Section>

          <Separator />

          <Section title={tExprHelp.opsTitle}>
            <div className="grid gap-1">
              {tExprHelp.ops.map(([term, gloss]) => (
                <Row key={term} term={term} gloss={gloss} />
              ))}
            </div>
          </Section>

          <Separator />

          <Section title={tExprHelp.rulesTitle}>
            <ul className="text-muted-foreground grid list-disc gap-1.5 pl-4 text-sm">
              {tExprHelp.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Section>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">{tExprHelp.close}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/** Re-exported so a caller can label the trigger without importing the dict. */
export const expressionHelpLabel = () => t.common.select
