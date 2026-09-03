import { AlertCircleIcon } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"

import { api, ApiError, setToken } from "@/lib/api"
import type { User } from "@/lib/types"
import { useAuth } from "@/features/auth/useAuth"
import { t } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t.appName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} aria-label={t.login.title}>
            <FieldGroup>
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
        </CardContent>
        {/* The other way in, on the other side of a rule: one of these is a
            password, the other is somebody else's sign-in page. */}
        <CardFooter className="flex-col gap-4">
          <Separator />
          <Button variant="outline" className="w-full" asChild>
            <a href="/api/auth/oidc/start">{t.login.google}</a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
