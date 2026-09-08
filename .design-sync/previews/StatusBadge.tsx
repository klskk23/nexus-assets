import { StatusBadge } from "nexus-assets-web"

/**
 * A status stores a palette name, not a hex value -- the name is a semantic
 * slot resolved once in the stylesheet, which is what let the whole palette be
 * re-tuned for the cream ground in 017 without an administrator touching
 * anything.
 *
 * The chip says its name, so telling two statuses apart never rests on colour.
 * Its fill sits just above the page and the border does the work: the fills
 * were built for a white page and measured 1.03 against cream, which is no
 * shape at all.
 */
export const BuiltIn = () => (
  <div className="flex flex-wrap items-center gap-2">
    <StatusBadge status="in_stock" />
    <StatusBadge status="checked_out" />
    <StatusBadge status="repairing" />
    <StatusBadge status="lost" />
    <StatusBadge status="retired" />
  </div>
)

/** In a row, which is where these are actually read. */
export const InATable = () => (
  <dl className="grid max-w-sm grid-cols-[1fr_auto] items-center gap-y-3 text-sm">
    <dt className="font-mono">2199023255611</dt>
    <dd><StatusBadge status="repairing" /></dd>
    <dt className="font-mono">2199023255610</dt>
    <dd><StatusBadge status="checked_out" /></dd>
    <dt className="font-mono">c40c1cd1</dt>
    <dd><StatusBadge status="in_stock" /></dd>
  </dl>
)

/** A status deleted while old transfer records still name it falls back to its
 *  key -- a timeline reading `on_loan` is a loss of polish, one reading
 *  `undefined` is a bug report. */
export const UnknownKey = () => <StatusBadge status="on_loan" />
