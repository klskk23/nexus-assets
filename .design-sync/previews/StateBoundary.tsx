import { StateBoundary } from "nexus-assets-web"

/**
 * The three states every list has before it has rows: loading, failed, and
 * genuinely empty. Wrapping them in one component is why no page in this
 * product renders a blank rectangle and calls it a result.
 *
 * An empty state says what would fill it; a failure offers the retry rather
 * than asking someone to reload the page and lose their filters.
 */
const Rows = () => (
  <ul className="grid gap-1 text-sm">
    <li className="font-mono">2199023255611</li>
    <li className="font-mono">2199023255610</li>
    <li className="font-mono">c40c1cd1</li>
  </ul>
)

export const Loaded = () => (
  <StateBoundary isLoading={false} error={null as unknown as Error}>
    <Rows />
  </StateBoundary>
)

export const Loading = () => (
  <StateBoundary isLoading error={null as unknown as Error}>
    <Rows />
  </StateBoundary>
)

export const Empty = () => (
  <StateBoundary
    isLoading={false}
    error={null as unknown as Error}
    isEmpty
    emptyTitle="没有匹配的设备"
    emptyHint="试试放宽筛选条件，或清除全部筛选。"
  >
    <Rows />
  </StateBoundary>
)

export const Failed = () => (
  <StateBoundary
    isLoading={false}
    error={new Error("网络连接失败")}
    onRetry={() => {}}
  >
    <Rows />
  </StateBoundary>
)
