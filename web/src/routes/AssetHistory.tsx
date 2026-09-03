import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Asset } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { t } from "@/i18n"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { Timeline } from "@/features/transfers/Timeline"
import { EditEvent } from "@/features/transfers/EditEvent"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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
    <div className="grid gap-6">
      {/* Back to the device rather than browser back: you can arrive here from
          the dialog, from a link somebody sent, or from a reload. */}
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to={`/assets/${id}`}>
          <ArrowLeftIcon data-icon="inline-start" />
          {t.assets.backToAsset}
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{asset?.display_name ?? id}</h1>
        {asset && <StatusBadge status={asset.status} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.assets.historyTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {editing && (
            <EditEvent event={editing} assetID={id} onClose={() => setEditing(null)} />
          )}
          <Timeline
            events={events}
            isLoading={timeline.isLoading}
            error={timeline.error as Error | null}
            editableId={tailID}
            onEdit={setEditing}
          />
        </CardContent>
      </Card>
    </div>
  )
}
