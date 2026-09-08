import { DistributionBar, StatusBadge } from "nexus-assets-web"

/**
 * How a set of devices is spread across something, as a row of tracks.
 *
 * It replaced a charting library in 017 -- 354 KB drawing one series of
 * horizontal bars with no axis worth reading, which is a track with a fill,
 * and CSS states the proportions exactly.
 *
 * Each row is a button, so the keyboard reaches the list the same way the
 * mouse does. Proportions are against the LARGEST row rather than the total:
 * against the total a real ledger draws twelve slivers and one bar, while the
 * question this answers is which ones are big. The absolute count sits beside
 * each track, so nothing is lost by the choice.
 *
 * Every story sits on `--well`: this component's home is one of the overview's
 * paired blocks, and its groove is `--background`, which is all but invisible
 * on the card frame's white.
 */
const block = {
  background: "var(--well)",
  padding: "1.25rem",
  borderRadius: 28,
  maxWidth: "32rem",
} as const

/** Across categories -- the label is the category's name. */
export const Categories = () => (
  <div style={block}>
    <DistributionBar
      data={[
        { id: "net", label: "网络设备", count: 62 },
        { id: "srv", label: "服务器", count: 41 },
        { id: "pc", label: "办公终端", count: 28 },
        { id: "mob", label: "移动设备", count: 9 },
        { id: "misc", label: "外围设备", count: 2 },
      ]}
      rowLabel={(r) => `${String(r.label)} ${r.count} 台`}
      onSelect={() => {}}
    />
  </div>
)

/**
 * Across statuses -- the label is a chip, so the row carries its palette.
 *
 * The track stays sage in both lists. In this palette sage means quantity and
 * the status palettes mean status: painting the bar with the status colour too
 * would say the same thing twice, in a tint that measures 1.0x against the
 * page and could not carry it anyway.
 */
export const Statuses = () => (
  <div style={block}>
    <DistributionBar
      data={[
        { id: "in_stock", label: <StatusBadge status="in_stock" />, count: 36 },
        { id: "checked_out", label: <StatusBadge status="checked_out" />, count: 12 },
        { id: "repairing", label: <StatusBadge status="repairing" />, count: 12 },
        { id: "lost", label: <StatusBadge status="lost" />, count: 0 },
        { id: "retired", label: <StatusBadge status="retired" />, count: 0 },
      ]}
      rowLabel={(r) => `${r.id} ${r.count} 台`}
      onSelect={() => {}}
    />
  </div>
)

/**
 * One device still draws a mark rather than a hairline that reads as zero --
 * and zero itself draws nothing at all. The minimum-width mark exists so a
 * count of one is visible; at zero it would be claiming there is a little of
 * something there.
 */
export const OneAndNone = () => (
  <div style={block}>
    <DistributionBar
      data={[
        { id: "net", label: "网络设备", count: 480 },
        { id: "srv", label: "服务器", count: 12 },
        { id: "lab", label: "实验室仪器", count: 1 },
        { id: "spare", label: "备件", count: 0 },
      ]}
      rowLabel={(r) => `${String(r.label)} ${r.count} 台`}
      onSelect={() => {}}
    />
  </div>
)
