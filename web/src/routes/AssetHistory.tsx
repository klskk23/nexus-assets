import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Asset } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { t } from "@/i18n"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { PageHeader } from "@/features/common/PageHeader"
import { Timeline } from "@/features/transfers/Timeline"
import { EditEvent } from "@/features/transfers/EditEvent"
import { Button } from "@/components/ui/button"

interface DetailResponse {
  asset: Asset
}

/**
 * Every movement of one device, on a page of its own.
 *
 * The dialog over the list shows the last five, which is what nearly every
 * question needs. This is where the rest lives: dozens of events want a page's
 * width and a page's scrollbar, not a box's.
 */
export function AssetHistory() {
  const { id = "" } = useParams()
  const [editing, setEditing] = useState<Transfer | null>(null)

  const detail = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get<DetailResponse>(`/assets/${id}`),
  })
  const timeline = useQuery({
    queryKey: ["timeline", id],
    queryFn: () => api.get<Transfer[]>(`/assets/${id}/transfers`),
  })
  const events = timeline.data ?? []
  const tailID = events[events.length - 1]?.id
  const asset = detail.data?.asset

  return (
    <div className="grid gap-14">
      <div className="grid gap-3">
        {/* Back to the device rather than browser back: you can arrive here
            from the dialog, from a link somebody sent, or from a reload. It
            belongs to the title, not to a band of its own -- 56px above and
            below would leave a lone ghost button in the middle of nowhere. */}
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link to={`/assets/${id}`}>
            <ArrowLeftIcon data-icon="inline-start" />
            {t.assets.backToAsset}
          </Link>
        </Button>

        <PageHeader
          title={
            <>
              <span className="font-heading tabular-nums">{asset?.display_name ?? id}</span>
              {asset && <StatusBadge status={asset.status} />}
            </>
          }
        />
      </div>

      <section aria-label={t.assets.historyTitle} className="grid content-start gap-[22px]">
        <h2 className="text-[21px] leading-tight font-bold">{t.assets.historyTitle}</h2>
        <div className="grid gap-[22px]">
          {editing && <EditEvent event={editing} assetID={id} onClose={() => setEditing(null)} />}
          <Timeline
            events={events}
            isLoading={timeline.isLoading}
            error={timeline.error as Error | null}
            editableId={tailID}
            onEdit={setEditing}
          />
        </div>
      </section>
    </div>
  )
}
