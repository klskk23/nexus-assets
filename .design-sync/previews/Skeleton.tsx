import { Skeleton } from "nexus-assets-web"

/**
 * Shaped like the thing it stands in for, so the page does not jump when the
 * data lands. A single grey block that becomes a six-column table has told the
 * reader nothing except that something is happening.
 */
export const TableRows = () => (
  <div className="grid gap-3" style={{ maxWidth: "32rem" }}>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="grid grid-cols-[8rem_1fr_5rem] items-center gap-4">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-6 rounded-full" />
      </div>
    ))}
  </div>
)

export const Card = () => (
  <div className="grid gap-3 rounded-[28px] border p-5" style={{ maxWidth: "20rem" }}>
    <Skeleton className="h-5 w-24 rounded-full" />
    <Skeleton className="h-9 w-16" />
  </div>
)
