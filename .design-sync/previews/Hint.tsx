import { Hint } from "nexus-assets-web"

/**
 * The question mark beside a label. This product's rule is that a hint with an
 * input goes in the placeholder -- read at the moment it is needed, costing no
 * vertical space -- and everything else hangs here, on hover or on focus.
 *
 * Three kinds of thing may NOT hide in here and must stay visible: a refusal, a
 * consequence you should know before ticking, and a statement of current state.
 * Hidden, those are the same as unsaid.
 */
export const BesideALabel = () => (
  <div className="flex items-center gap-2 text-sm">
    <span className="font-medium">编号字段</span>
    <Hint>指定哪个字段作为这个类别的人类可读编号。未指定时回退到 UUID 前 8 位。</Hint>
  </div>
)

export const OnAHeading = () => (
  <h2 className="flex items-center gap-2 text-lg">
    类别分布
    <Hint>含子类别，不含已报废的设备。</Hint>
  </h2>
)
