import { Link } from "react-router"

import type { HolderEntity } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Fact, Pane } from "@/features/common/Pane"
import { RefusalAlert, type Refusal } from "./RefusalAlert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

interface Props {
  holder: HolderEntity
  holders: HolderEntity[]
  /** Devices standing here, its subtree included. */
  count: number
  onEdit: () => void
  onSetDefaultStock: () => void
  settingDefaultStock: boolean
  /** Why the server would not move the marker here, if it would not. */
  stockRefusal: Refusal | null
}

/**
 * One holder: what kind it is, what it hangs from, and what is standing in it.
 *
 * Thinner than the other three panes, and that is a choice rather than an
 * omission. A category configures fields, a model carries defaults, a field
 * has bindings -- a holder is a place. Its children are already drawn in the
 * rail beside this, and listing them again would be the page saying the same
 * thing twice in two shapes.
 *
 * Read-only like its neighbours, **with one deliberate exception**: the
 * default-stock button. 024 decision 12 keeps destructive and editing controls
 * in the dialog because switching selection here costs a single click. That
 * reasoning holds for renaming and deleting, and it does not hold for this
 * one, because `holder.default_stock` is its **own permission**. Left in the
 * edit dialog it shared an entrance with `holder.update`, so somebody with the
 * one and not the other could tick the box, save, and only then be told no.
 * A control that answers "may I" before the attempt has to be where the answer
 * can be seen.
 */
export function HolderDetail({
  holder,
  holders,
  count,
  onEdit,
  onSetDefaultStock,
  settingDefaultStock,
  stockRefusal,
}: Props) {
  const { deniedReason } = usePermissions()
  const parent = holders.find((h) => h.id === holder.parent_id)
  const deniedEdit = deniedReason("holder.update")
  const deniedStock = deniedReason("holder.default_stock")
  // Already the one. The server only ever accepts setting the marker, never
  // clearing it -- it moves rather than switching off -- so the button has
  // nothing to do here and says why instead of looking broken.
  const already = holder.is_default_stock
  // Only a location can hold it; the server refuses anything else. Shown
  // disabled with the reason rather than hidden, the same way the create
  // dialog greys out 部门 when there is no company yet: a control that is
  // missing leaves "why can't I" unanswered, and this whole button exists
  // because the answer used to arrive only after the attempt.
  const wrongKind = holder.type !== "location"
  const stockReason = already
    ? tMeta.holders.alreadyDefaultStock
    : wrongKind
      ? tMeta.holders.stockLocationOnly
      : (deniedStock ?? undefined)

  return (
    <Pane
      title={holder.name}
      tag={tMeta.entityTypes[holder.type] ?? holder.type}
      action={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onSetDefaultStock}
            disabled={already || wrongKind || Boolean(deniedStock) || settingDefaultStock}
            title={stockReason}
          >
            {settingDefaultStock && <Spinner aria-hidden />}
            {tMeta.holders.setDefaultStock}
          </Button>
          <Button
            size="sm"
            onClick={onEdit}
            disabled={Boolean(deniedEdit)}
            title={deniedEdit ?? undefined}
          >
            {tMeta.holders.edit}
          </Button>
        </>
      }
      facts={
        <>
          <Fact label={tMeta.holders.type}>{tMeta.entityTypes[holder.type] ?? holder.type}</Fact>
          {/* A name, not a link. Moving the selection is what the rail is for,
              and a second way to do it inside the pane would be a second thing
              to keep in step (024 decision 8). */}
          <Fact label={tMeta.holders.parent}>
            {parent ? (
              parent.name
            ) : (
              <span className="text-muted-foreground">{tMeta.holders.noParent}</span>
            )}
          </Fact>
          <Fact label={tMeta.holders.defaultStock}>
            {holder.is_default_stock ? (
              <Badge>{tMeta.holders.defaultStock}</Badge>
            ) : (
              <span className="text-muted-foreground">{t.common.no}</span>
            )}
          </Fact>
          {/* Same number as the row in the rail, and the same one the list on
              the other end of this link will count. Three places, one reading
              -- a holder saying 42 and its list showing 12 is the defect 024
              spent a whole round closing for categories. */}
          <Fact label={tMeta.holders.deviceCount}>
            <Link
              to={`/assets?holder_type=entity&holder_id=${holder.id}&holder_include_descendants=true`}
              className="hover:text-primary underline-offset-4 hover:underline"
            >
              {tMeta.holders.viewAssets(count)}
            </Link>
          </Fact>
        </>
      }
    >
      {/* Its own block rather than a fourth entry in the band: a note is prose
          of any length, and the band is four short facts on one line. 025
          deleted the model's note along with its test and nobody noticed until
          it was reported, which is why this one arrives with a test. */}
      {/* Where the marker's refusal lands. It belongs beside the button that
          caused it: the old page put this above a table because the control
          was a row action, and there is no table and no row action now. */}
      {stockRefusal && <RefusalAlert refusal={stockRefusal} />}
      {holder.note && (
        <div>
          <p className="text-muted-foreground mb-1 text-[13px]">{tMeta.holders.note}</p>
          <p className="text-[15px] break-words">{holder.note}</p>
        </div>
      )}
    </Pane>
  )
}
