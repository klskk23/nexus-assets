import {
  CategoryFilter,
  Checkbox,
  Field,
  FieldLabel,
  Input,
} from "nexus-assets-web"

/**
 * The category dropdown three pages narrow by. Not a generic Select: it holds
 * its own query and its own "all" sentinel, so the three pages cannot end up
 * disagreeing about what an unset category means.
 *
 * Two decisions are baked in. It asks for the categories with no paging
 * parameters, which is how these endpoints answer with the whole set -- a
 * dropdown that offered only the first page would hide exactly the category
 * somebody was looking for. And "全部类别" is a real sentinel value from
 * `lib/select`, because `SelectItem` refuses an empty string: an unset filter
 * still has to be a choosable row.
 *
 * Its own label is `sr-only`. In a filter row the chosen value is the label,
 * and a column of tiny captions above a row of controls doubles its height.
 *
 * Empty here on purpose: preview cards have no server, so the list is the
 * sentinel alone. That is exactly what the control looks like on a fresh
 * installation before anybody has made a category.
 */
export const AllCategories = () => <CategoryFilter value="" onChange={() => {}} />

/**
 * Where it sits: the one filter row above the asset table, between the search
 * box and the modifier that only means something once a category is chosen.
 */
export const InAFilterRow = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Input placeholder="搜索" className="w-56" defaultValue="" aria-label="搜索资产" />
    <CategoryFilter value="" onChange={() => {}} />
    <Field orientation="horizontal" className="w-auto">
      <Checkbox id="cf-descendants" defaultChecked />
      <FieldLabel htmlFor="cf-descendants">含子类别</FieldLabel>
    </Field>
  </div>
)
