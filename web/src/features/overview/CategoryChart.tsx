import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import { tOverview } from "@/i18n"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface CategoryCount {
  category_id: string
  name: string
  count: number
}

/**
 * One series, keyed by the data's own field name.
 *
 * The key is what the chart turns into `--color-count`, so it has to match the
 * Bar's `dataKey`; the label is what the tooltip reads out.
 */
const chartConfig = {
  count: { label: tOverview.unit, color: "var(--chart-1)" },
} satisfies ChartConfig

interface Props {
  data: CategoryCount[]
  onSelect: (categoryID: string) => void
}

/**
 * How many devices sit under each top-level category.
 *
 * Its own module, loaded on demand: the charting library is larger than the
 * rest of the overview put together, and the status cards and recent transfers
 * have no reason to wait for it. What arrives first is what people read first.
 */
export default function CategoryChart({ data, onSelect }: Props) {
  return (
    <ChartContainer
      config={chartConfig}
      // Height follows the row count, so four categories do not sit in the
      // whitespace of twelve.
      className="w-full"
      style={{ height: `${Math.max(140, data.length * 40)}px` }}
    >
      <BarChart accessibilityLayer layout="vertical" data={data} margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={96} />
        <XAxis type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar
          dataKey="count"
          fill="var(--color-count)"
          radius={4}
          // The numbers do not draw until the entrance animation finishes, so
          // the figures you came for arrive a beat late -- on a screen you
          // land on every session.
          isAnimationActive={false}
          // The bar is the control: the list it replaced was clickable, and
          // losing that would be a step back.
          className="cursor-pointer"
          onClick={(d: { payload?: CategoryCount }) => d.payload && onSelect(d.payload.category_id)}
        >
          <LabelList
            dataKey="count"
            position="right"
            className="fill-muted-foreground tabular-nums"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
