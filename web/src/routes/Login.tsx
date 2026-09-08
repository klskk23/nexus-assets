import { AlertCircleIcon } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"

import { api, ApiError, setToken } from "@/lib/api"
import type { User } from "@/lib/types"
import { useAuth } from "@/features/auth/useAuth"
import { t } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Separator } from "@/components/ui/separator"

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

  return (
    /* Two columns: what this is on the left, the way in on the right. The left
     * one goes away below md rather than stacking -- on a phone the way in
     * should be the first thing on screen, not the second. */
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between gap-8 p-12 md:flex">
        <span className="font-heading text-3xl leading-none">{t.appName}</span>
        {/* Three discs of the palette, overlapped. The one piece of decoration
         * on the whole product, and it is here because a sign-in page is the
         * only screen with nothing of the user's own on it to look at. */}
        <div aria-hidden className="flex items-center">
          <span className="bg-primary size-28 shrink-0 rounded-full" />
          <span className="-ml-10 size-28 shrink-0 rounded-full bg-accent-2" />
          <span className="bg-background -ml-10 size-28 shrink-0 rounded-full" />
        </div>
        <p className="text-muted-foreground text-sm">{t.login.tagline}</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <form onSubmit={onSubmit} aria-label={t.login.title}>
            <FieldGroup>
              {/* The wordmark only on narrow screens: the left column carries
                  it everywhere else, and two of them is one too many. */}
              <span className="font-heading text-2xl leading-none md:hidden">{t.appName}</span>
              <Field>
                <FieldLabel htmlFor="email">{t.login.email}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">{t.login.password}</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={submitting}>
                {submitting && <Spinner data-icon="inline-start" aria-hidden />}
                {submitting ? t.login.submitting : t.login.submit}
              </Button>
            </FieldGroup>
          </form>

          {/* The other way in, on the other side of a rule: one of these is a
              password, the other is somebody else's sign-in page. */}
          <Separator className="my-6" />
          <Button variant="outline" className="w-full" asChild>
            <a href="/api/auth/oidc/start">{t.login.google}</a>
          </Button>
          {/* Before the button, not after a rejection. The admission boundary is
              the domain whitelist, and someone whose account does not exist yet
              has no other way to find that out -- the failure comes back from
              an identity provider on another origin. The domains themselves are
              deliberately not named: they are configuration, and this page is
              served to anyone who can reach the host. */}
          <p className="text-muted-foreground mt-3 text-sm">{t.login.domains}</p>
        </div>
      </div>
    </div>
  )
}
