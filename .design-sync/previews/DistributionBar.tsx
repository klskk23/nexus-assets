import { DistributionBar } from "nexus-assets-web"

/**
 * How the devices are spread across categories, as a row of tracks. It
 * replaced a charting library in 017 -- 354 KB drawing one series of
 * horizontal bars with no axis worth reading, which is a track with a fill,
 * and CSS states the proportions exactly.
 *
 * Each row is a button, so the keyboard reaches the category list the same way
 * the mouse does. Proportions are against the LARGEST category rather than the
 * total: against the total a real ledger draws twelve slivers and one bar,
 * while the question this answers is which categories are big. The absolute
 * count sits beside each track, so nothing is lost by the choice.
 */
export const Categories = () => (
  <div style={{ maxWidth: "32rem" }}>
    <DistributionBar
      data={[
        { category_id: "net", name: "网络设备", count: 62 },
        { category_id: "srv", name: "服务器", count: 41 },
        { category_id: "pc", name: "办公终端", count: 28 },
        { category_id: "mob", name: "移动设备", count: 9 },
        { category_id: "misc", name: "外围设备", count: 2 },
      ]}
      onSelect={() => {}}
    />
  </div>
)

/** One device still draws a mark rather than a hairline that reads as zero. */
export const LongTail = () => (
  <div style={{ maxWidth: "32rem" }}>
    <DistributionBar
      data={[
        { category_id: "net", name: "网络设备", count: 480 },
        { category_id: "srv", name: "服务器", count: 12 },
        { category_id: "lab", name: "实验室仪器", count: 1 },
      ]}
      onSelect={() => {}}
    />
  </div>
)
