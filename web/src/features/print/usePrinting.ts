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

/** One saved combination of template, printer and paper on the print service. */
export interface Preset {
  id: string
  name: string
}

/**
 * What this deployment can print, by name.
 *
 * Relayed through this server because the print service sends no CORS headers.
 * The point of asking at all is that picking where a category prints should be
 * a menu: an identifier copied between two browser tabs is a step that exists
 * only because nobody made the call.
 */
export function usePresets(enabled: boolean) {
  return useQuery({
    queryKey: ["print-presets"],
    queryFn: () => api.get<{ presets: Preset[] }>("/print/presets"),
    enabled,
    staleTime: 60_000,
  })
}
