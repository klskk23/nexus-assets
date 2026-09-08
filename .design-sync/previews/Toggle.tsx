import { Toggle } from "nexus-assets-web"

/**
 * A pill that stays pressed. Used where a view has two readings of the same
 * data rather than two destinations -- pressed is a state, not a place.
 */
export const Pressed = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Toggle pressed>含子类别</Toggle>
    <Toggle>只看我负责的</Toggle>
    <Toggle disabled>含已报废</Toggle>
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Toggle size="sm">紧凑</Toggle>
    <Toggle>默认</Toggle>
    <Toggle size="lg">宽松</Toggle>
  </div>
)
