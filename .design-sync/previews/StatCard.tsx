import { StatCard, StatusBadge } from "nexus-assets-web"

/**
 * One number on the overview and the way to the list behind it. The chip is
 * the label and the number is the content, so the number carries the weight --
 * and a zero is allowed to recede, because five equally loud cards with two of
 * them reading 0 spend the page's attention on nothing.
 *
 * Figures are tabular: these sit in a row and are read by comparison.
 */
export const StatusRow = () => (
  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
    <StatCard label={<StatusBadge status="in_stock" />} count={36} ariaLabel="在库 36 台" onOpen={() => {}} />
    <StatCard label={<StatusBadge status="checked_out" />} count={12} ariaLabel="已签出 12 台" onOpen={() => {}} />
    <StatCard label={<StatusBadge status="repairing" />} count={12} ariaLabel="维修中 12 台" onOpen={() => {}} />
    <StatCard label={<StatusBadge status="lost" />} count={0} ariaLabel="丢失 0 台" onOpen={() => {}} />
    <StatCard label={<StatusBadge status="retired" />} count={0} ariaLabel="已报废 0 台" onOpen={() => {}} />
  </div>
)

/** The receding zero, next to a card carrying a real number. */
export const ZeroRecedes = () => (
  <div className="grid grid-cols-2 gap-3" style={{ maxWidth: "28rem" }}>
    <StatCard label={<StatusBadge status="in_stock" />} count={1284} ariaLabel="在库 1284 台" onOpen={() => {}} />
    <StatCard label={<StatusBadge status="lost" />} count={0} ariaLabel="丢失 0 台" onOpen={() => {}} />
  </div>
)
