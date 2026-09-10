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

  return (
    /* The mark, at page scale, with the way in sitting on it.
     *
     * The four discs are the logo blown up and bled off the right edge -- the
     * same three circles the rail wears at 40px, plus the outlined one, sized
     * in vw so the composition holds its proportions instead of snapping
     * between two hand-placed layouts. The old version pinned them at fixed
     * pixels in a column that vanished below md; this one is one composition
     * that grows.
     *
     * The card is the product's own idiom, not a login-only invention:
     * background floating on well at 28px, exactly what the panel does beside
     * the rail on every other screen.
     *
     * This is the one screen with nothing of the reader's own on it, which is
     * what earns it the space to be looked at. */
    <div className="bg-well relative flex min-h-screen items-center p-[clamp(24px,4vw,64px)]">
      {/* Deliberately none of the eight status palettes: on this product a
          colour means a state a device is in, and a decoration borrowing one
          would be saying something. Terracotta, cream and sage are the mark's
          own three voices.
          
          Gone below md, which the desktop prototype this came from did not
          have to answer for. Measured at 390px: the card leaves 24px of gap,
          so the whole composition hides behind it and the only thing on screen
          is a terracotta stripe down the right edge -- which reads as a
          rendering fault, not as a mark. The mark is still on the phone; it is
          the 52px one inside the card, which this page did not have before. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden max-md:hidden"
      >
        <span className="bg-primary absolute top-1/2 right-[clamp(-260px,-9vw,-60px)] aspect-square w-[clamp(420px,48vw,760px)] -translate-y-1/2 rounded-full" />
        <span className="bg-background absolute top-1/2 right-[clamp(60px,15vw,300px)] aspect-square w-[clamp(240px,27vw,430px)] translate-y-[-64%] rounded-full" />
        <span className="bg-accent-2 absolute top-1/2 right-[clamp(10px,5vw,120px)] aspect-square w-[clamp(150px,17vw,270px)] translate-y-[14%] rounded-full opacity-[.62]" />
        <span className="border-border absolute top-1/2 right-[clamp(300px,42vw,760px)] aspect-square w-[clamp(64px,7vw,104px)] translate-y-[150%] rounded-full border" />
      </div>

      <div className="bg-background relative w-full max-w-[472px] rounded-[28px] px-[clamp(28px,3vw,46px)] py-[clamp(32px,3.4vw,52px)]">
        <div className="grid gap-8">
          {/* The mark beside the name, which the old page left out entirely --
              the one screen a first-time reader lands on was the only one not
              showing them what the product is called and what it looks like.
              Caprasimo covers every glyph in the product name, which is why it
              is allowed to be this loud here and why Chinese page titles are
              not. */}
          <div className="grid gap-3">
            <div className="flex items-center gap-4">
              <Logo className="size-[52px] shrink-0" />
              <span className="font-heading grid text-[clamp(34px,3.4vw,46px)] leading-[1.05]">
                <span>{t.appName.split(" ")[0]}</span>
                <span className="text-primary">{t.appName.split(" ").slice(1).join(" ")}</span>
              </span>
            </div>
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

              {/* The other way in, on the other side of a rule: one of these is
                  a password, the other is somebody else's sign-in page. */}
              <FieldSeparator>{t.login.or}</FieldSeparator>
              <Button variant="outline" className="w-full" asChild>
                <a href="/api/auth/oidc/start">{t.login.google}</a>
              </Button>
            </FieldGroup>
          </form>
        </div>
      </div>
    </div>
  )
}
