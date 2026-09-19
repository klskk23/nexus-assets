import { WarningCircle } from "@phosphor-icons/react"
import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"

import { api, ApiError, setToken } from "@/lib/api"
import type { User } from "@/lib/types"
import { useAuth } from "@/features/auth/useAuth"
import { t } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Logo } from "@/features/common/Logo"

interface LoginResponse {
  token: string
  user: User
}

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // The OIDC callback redirects back with the token in the fragment, which
  // never reaches the server or a proxy log the way a query parameter would.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const failure = params.get("error")
    if (failure) {
      setError(failure)
      return
    }
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token")
    if (!token) return

    setToken(token)
    api
      .get<User>("/me")
      .then((u) => {
        signIn(token, u)
        window.location.hash = ""
        navigate("/", { replace: true })
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t.common.error))
  }, [signIn, navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await api.post<LoginResponse>("/auth/login", { email, password })
      signIn(res.token, res.user)
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.common.error)
    } finally {
      setSubmitting(false)
    }
  }

  const [brandFirst, ...brandRest] = t.appName.split(" ")

  return (
    /* Handoff §1, and the prototype's own numbers where the handoff gives
     * none. A radial bloom of the deepest accent step at the upper right
     * over the ground; two hairline circles out to the right, the smaller one
     * carrying an 80px glow; one horizontal rule fading at both ends. The
     * card region is left-aligned and 420px at most -- Nocturne is
     * "left-aligned, asymmetric: content hugs the left edge with whitespace on
     * the right".
     *
     * This is the one screen with nothing of the reader's own on it, which is
     * what earns it the space to be looked at. The decoration goes below md:
     * on a phone the circles would sit behind the card and read as a fault,
     * and the 36px mark inside the card is still there. */
    <div className="bg-background relative grid min-h-screen items-center overflow-hidden bg-[radial-gradient(1200px_600px_at_85%_30%,var(--color-accent-900)_0%,transparent_60%)] p-[clamp(24px,5vw,72px)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 max-md:hidden">
        <span className="border-accent-800 absolute top-[22%] right-[14%] aspect-square w-[min(38vw,520px)] rounded-full border" />
        <span className="border-accent-700 absolute top-[12%] right-[24%] aspect-square w-[min(20vw,260px)] rounded-full border shadow-[0_0_80px_color-mix(in_srgb,var(--primary)_18%,transparent)]" />
        <span className="absolute top-1/2 right-0 h-px w-[min(50vw,640px)] bg-[linear-gradient(to_right,transparent,var(--primary)_48px,var(--primary)_calc(100%-48px),transparent)] opacity-50" />
      </div>

      <div className="relative grid w-full max-w-[420px] gap-7">
        {/* The mark beside the name: a 36px square with a 24px glow, then the
            name at 28px. The name is Latin, so the heading face renders every
            glyph of it. */}
        <div className="grid gap-2">
          <div className="flex items-center gap-3.5">
            <Logo className="size-9 rounded-[10px] shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_30%,transparent)]" />
            <span className="font-heading text-[28px] leading-tight whitespace-nowrap">
              {brandFirst} <span className="text-primary">{brandRest.join(" ")}</span>
            </span>
          </div>
          <p className="text-neutral-400 text-sm">{t.login.tagline}</p>
        </div>

        <form onSubmit={onSubmit} aria-label={t.login.title}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">{t.login.email}</FieldLabel>
              <Input
                id="email"
                type="email"
                size="lg"
                autoComplete="username"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t.login.password}</FieldLabel>
              <Input
                id="password"
                type="password"
                size="lg"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && (
              <Alert variant="destructive">
                <WarningCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting && <Spinner aria-hidden />}
              {submitting ? t.login.submitting : t.login.submit}
            </Button>

            {/* The other way in, on the other side of a rule: one of these is
                a password, the other is somebody else's sign-in page. */}
            <FieldSeparator>{t.login.or}</FieldSeparator>
            <Button variant="secondary" size="lg" className="w-full" asChild>
              <a href="/api/auth/oidc/start">{t.login.google}</a>
            </Button>
          </FieldGroup>
        </form>
      </div>
    </div>
  )
}
