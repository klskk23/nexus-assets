import { useState } from "react"

import { api } from "@/lib/api"
import type { AssetPage } from "@/lib/types"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

interface Props {
  /** The filter the list is showing, without offset or limit. */
  params: URLSearchParams
  /** How many devices match that filter -- the list response already says. */
  total: number
  /** How many of them are ticked right now. */
  selectedCount: number
  /** Ticks every matching device. Additive: nothing already ticked is lost. */
  onSelectAll: (ids: string[]) => void
}

/** The server refuses more than this in one page, so all of them takes several. */
const PAGE = 200

/**
 * The strip that appears once a whole page is ticked, offering the rest.
 *
 * It only exists in that state. Ticking twenty rows out of six hundred is a
 * deliberate act and needs no offer; ticking every row on the page is the
 * gesture that usually means "and the others too", and the alternative is
 * paging thirty times.
 *
 * N is the total the list response already carries, so nothing is counted
 * twice and nothing new had to be added to the server for it. The ids are a
 * different matter -- an operation needs to name its devices, and the list
 * endpoint caps a page at 200 -- so this walks the pages when asked. It is
 * asked only when somebody clicks, never on render.
 */
export function SelectAllBanner({ params, total, selectedCount, onSelectAll }: Props) {
  const [loading, setLoading] = useState(false)

  if (selectedCount >= total) {
    return (
      <p className="text-muted-foreground px-1 text-sm" role="status">
        {t.assets.allSelected(total)}
      </p>
    )
  }

  async function selectAll() {
    setLoading(true)
    try {
      const ids: string[] = []
      for (let offset = 0; offset < total; offset += PAGE) {
        const page = new URLSearchParams(params)
        page.set("limit", String(PAGE))
        page.set("offset", String(offset))
        const res = await api.get<AssetPage>(`/assets?${page}`)
        ids.push(...res.items.map((a) => a.id))
        // A device deleted by somebody else mid-walk would leave this looping
        // to a total that can no longer be reached.
        if (res.items.length === 0) break
      }
      onSelectAll(ids)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm" role="status">
      <span className="text-muted-foreground">{t.assets.pageSelected(selectedCount)}</span>
      <Button variant="link" size="sm" className="h-auto p-0" disabled={loading} onClick={selectAll}>
        {loading && <Spinner data-icon="inline-start" aria-hidden />}
        {t.assets.selectAllMatching(total)}
      </Button>
      {/* Said once, here, rather than in a tooltip on every row: the range
          gesture is not discoverable, and this is the moment somebody is
          selecting in bulk and would use it. */}
      <span className="text-muted-foreground">{t.assets.shiftHint}</span>
    </div>
  )
}
