import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"

/**
 * Whether this deployment prints at all.
 *
 * Asked once and cached: it is a property of the installation, not of the
 * session. An installation without a printer shows nothing about printing --
 * no button, no category setting -- rather than a control that answers 404.
 */
export function usePrinting(): boolean {
  const { data } = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => api.get<{ printing: boolean }>("/capabilities"),
    staleTime: Infinity,
  })
  return data?.printing ?? false
}
