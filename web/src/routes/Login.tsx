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
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

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
    /* The form on the left, the decoration on the right -- and the decoration
     * is what goes away on a phone, not the way in. This is the one screen in
     * the product with nothing of the user's own on it, so it is the one place
     * that can spend space on being looked at. */
    <div className="grid min-h-screen items-center gap-16 p-12 max-md:p-6 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="grid gap-8">
        {/* Two lines at 52px. Caprasimo covers every glyph in the product
            name, which is exactly why it is allowed to be this loud here --
            and why the Chinese page titles are not. */}
        <div className="grid gap-3">
          <span className="font-heading grid text-[52px] leading-[1.05]">
            <span>{t.appName.split(" ")[0]}</span>
            <span className="text-primary">{t.appName.split(" ").slice(1).join(" ")}</span>
          </span>
          <p className="text-muted-foreground">{t.login.tagline}</p>
        </div>

        <form onSubmit={onSubmit} aria-label={t.login.title}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">{t.login.email}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                className="h-[50px]"
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
                className="h-[50px]"
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
              {submitting && <Spinner aria-hidden />}
              {submitting ? t.login.submitting : t.login.submit}
            </Button>

            {/* The other way in, on the other side of a rule: one of these is a
                password, the other is somebody else's sign-in page. */}
            <FieldSeparator>{t.login.or}</FieldSeparator>
            <Button variant="outline" className="w-full" asChild>
              <a href="/api/auth/oidc/start">{t.login.google}</a>
            </Button>
          </FieldGroup>
        </form>
      </div>

      {/* Four discs, and nothing else. Deliberately none of the eight status
          palettes: on this product a colour means a state a device is in, and
          a decoration that borrowed one would be saying something. */}
      <div aria-hidden className="relative hidden h-[440px] md:block">
        <span className="bg-card absolute top-12 left-10 size-[300px] rounded-full" />
        <span className="bg-accent-2 absolute top-40 left-56 size-[190px] rounded-full opacity-[.62]" />
        <span className="bg-primary absolute top-24 left-[26rem] size-[132px] rounded-full opacity-90" />
        <span className="border-border absolute top-64 left-[30rem] size-[84px] rounded-full border" />
      </div>
    </div>
  )
}
