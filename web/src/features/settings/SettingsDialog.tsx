import { CheckIcon, CopyIcon, ExternalLinkIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { copyText } from "@/lib/clipboard"
import type { User } from "@/lib/types"
import { LANGS, LANG_NAMES, locale, t, tConfirm, type Lang } from "@/i18n"
import { useLanguage } from "@/i18n/useLanguage"
import { useTheme, type Theme } from "@/features/theme/useTheme"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface APIKey {
  id: string
  name: string
  prefix?: string
  /** Lives in the configuration file: listed so it is not a mystery, but it
   * goes away by being edited out and restarted, not from here. */
  from_config?: boolean
  expires_at?: string
  last_used_at?: string
  created_at: string
}

interface Props {
  onClose: () => void
}

/**
 * How long a new key lasts. Zero is forever, which the server has always
 * accepted and the interface used not to offer -- a key wired into a service
 * that nobody will remember to rotate is better honest about it than quietly
 * expiring on a Sunday.
 */
const KEY_DAYS = [30, 90, 365, 0]

/**
 * The account's own settings: how the interface looks, and what may call the
 * API on its behalf.
 *
 * Language and theme are saved to the account as well as applied here. They
 * used to live in one browser's localStorage, which meant a person who chose
 * English chose it again on every machine they touched.
 */
export function SettingsDialog({ onClose }: Props) {
  const queryClient = useQueryClient()
  const { lang, setLang } = useLanguage()
  const { theme, setTheme } = useTheme()
  const [banner, setBanner] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [keyName, setKeyName] = useState("")
  const [keyDays, setKeyDays] = useState(KEY_DAYS[1])
  // The secret, for as long as this dialog stays open. It exists nowhere else:
  // the server kept only its hash.
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean | null>(null)
  const [revoking, setRevoking] = useState<APIKey | null>(null)

  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<APIKey[]>("/api-keys"),
  })

  const savePreference = useMutation({
    mutationFn: (patch: { lang?: string; theme?: string }) => api.patch<User>("/me", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const createKey = useMutation({
    mutationFn: () =>
      api.post<{ key: APIKey; secret: string }>("/api-keys", { name: keyName, days: keyDays }),
    onSuccess: (res) => {
      setBanner(null)
      setSecret(res.secret)
      setCopied(null)
      setCreating(false)
      setKeyName("")
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api-keys/${id}`),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const chooseLang = (next: Lang) => {
    // Saved before the switch: changing the language remounts this subtree,
    // and a mutation fired from a component that is about to go away is a
    // mutation nobody is left to report on.
    savePreference.mutate({ lang: next })
    setLang(next)
  }

  const chooseTheme = (next: Theme) => {
    setTheme(next)
    savePreference.mutate({ theme: next })
  }

  const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale()) : null)

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.settings.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-3">
            <p className="text-sm font-medium">{t.settings.appearance}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="set-lang">{t.settings.language}</FieldLabel>
                <Select value={lang} onValueChange={(v) => chooseLang(v as Lang)}>
                  <SelectTrigger id="set-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {LANGS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {LANG_NAMES[l]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="set-theme">{t.settings.theme}</FieldLabel>
                <Select value={theme} onValueChange={(v) => chooseTheme(v as Theme)}>
                  <SelectTrigger id="set-theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="dark">{t.settings.themeDark}</SelectItem>
                      <SelectItem value="light">{t.settings.themeLight}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <FieldDescription>{t.settings.savedToAccount}</FieldDescription>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">{t.settings.keys}</p>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => setCreating(true)}
              >
                <PlusIcon data-icon="inline-start" />
                {t.settings.keyCreate}
              </Button>
            </div>
            <FieldDescription>{t.settings.keysHint}</FieldDescription>

            {/* Shown once, and only here. Closing the dialog is the point of
                no return, which is why it says so. */}
            {secret && (
              <Alert>
                <AlertDescription className="grid gap-2">
                  <span>{t.settings.keyCreated}</span>
                  <div className="flex items-center gap-2">
                    <code
                      id="new-key-secret"
                      className="bg-muted rounded px-2 py-1 font-mono text-xs break-all"
                    >
                      {secret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={tConfirm.copyPhrase}
                      onClick={async () =>
                        setCopied(
                          await copyText(secret, document.getElementById("new-key-secret")),
                        )
                      }
                    >
                      {copied === true ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <span className="text-muted-foreground text-xs">{t.settings.keyCopyHint}</span>
                </AlertDescription>
              </Alert>
            )}

            {creating && (
              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Field>
                  <FieldLabel htmlFor="key-name">{t.settings.keyName}</FieldLabel>
                  <Input
                    id="key-name"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                </Field>
                <Field className="w-auto">
                  <FieldLabel htmlFor="key-days">{t.settings.keyDays}</FieldLabel>
                  <Select value={String(keyDays)} onValueChange={(v) => setKeyDays(Number(v))}>
                    <SelectTrigger id="key-days" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {KEY_DAYS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d === 0 ? t.settings.keyNoExpiry : d}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {/* Not "new key" again: the button that opened this form
                    already says that, and two controls with one name is one
                    the person has to guess at. */}
                <Button
                  onClick={() => createKey.mutate()}
                  disabled={keyName === "" || createKey.isPending}
                >
                  {t.settings.keyGenerate}
                </Button>
              </div>
            )}

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.settings.keyName}</TableHead>
                    <TableHead>{t.settings.keyPrefix}</TableHead>
                    <TableHead>{t.settings.keyExpires}</TableHead>
                    <TableHead>{t.settings.keyLastUsed}</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">{t.common.actions}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(keys.data ?? []).map((k) => (
                    <ContextMenu key={k.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow aria-label={k.name}>
                          <TableCell>{k.name}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {k.prefix ?? ""}
                          </TableCell>
                          <TableCell>
                            {k.from_config ? (
                              <Badge variant="secondary">{t.settings.keyFromConfig}</Badge>
                            ) : (
                              (when(k.expires_at) ?? (
                                <Badge variant="outline">{t.settings.keyNoExpiry}</Badge>
                              ))
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {when(k.last_used_at) ?? t.settings.keyNever}
                          </TableCell>
                          {/* A button, not only the row menu: these rows have
                              no click of their own to compete with, and a key
                              nobody can find how to revoke is a key that stays
                              alive after the person who made it has left. */}
                          <TableCell>
                            {!k.from_config && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`${t.settings.keyRevoke} ${k.name}`}
                                onClick={() => setRevoking(k)}
                              >
                                <Trash2Icon />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          variant="destructive"
                          disabled={k.from_config}
                          onSelect={() => setRevoking(k)}
                        >
                          {t.settings.keyRevoke}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </TableBody>
              </Table>
            </div>
            {(keys.data ?? []).length === 0 && (
              <p className="text-muted-foreground text-sm">{t.settings.keysEmpty}</p>
            )}
          </div>

          <Separator />

          <div className="grid gap-2">
            <p className="text-sm font-medium">{t.settings.docs}</p>
            <FieldDescription>{t.settings.docsHint}</FieldDescription>
            <div>
              <Button variant="outline" size="sm" asChild>
                <a href="/api/docs" target="_blank" rel="noreferrer">
                  <ExternalLinkIcon data-icon="inline-start" />
                  {t.settings.docsOpen}
                </a>
              </Button>
            </div>
          </div>

          {banner && (
            <Alert variant="destructive">
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            {/* Close, not cancel: everything in here has already taken
                effect by the time this is pressed. */}
            <Button variant="ghost">{t.common.close}</Button>
          </DialogClose>
        </DialogFooter>

        <ConfirmDialog
          open={revoking !== null}
          onOpenChange={(next) => !next && setRevoking(null)}
          title={t.settings.keyRevokeTitle}
          description={revoking ? t.settings.keyRevokeHint(revoking.name) : ""}
          confirmLabel={t.settings.keyRevoke}
          onConfirm={() => revoking && revoke.mutate(revoking.id)}
        />
      </DialogContent>
    </Dialog>
  )
}
