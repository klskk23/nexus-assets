import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { api, endSession, getToken, restoreSession, setSessionLostHandler, setToken } from "@/lib/api"
import type { User } from "@/lib/types"

interface AuthValue {
  user: User | null
  isLoading: boolean
  signIn: (token: string, user: User) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Holds the session.
 *
 * The access token is minutes long and refreshable against a cookie the page
 * cannot read, so an expired token is not a sign-out: the api client renews it
 * behind the request that hit it. Two things are left for this to do -- try the
 * cookie once on a cold start, when there is no access token but the browser
 * may still hold a session, and clear up when even that fails.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setLocalToken] = useState<string | null>(() => getToken())
  // Only while the cookie is being tried: without it a cold start would flash
  // the login page at someone who is still signed in.
  const [restoring, setRestoring] = useState(() => getToken() === null)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    if (getToken() !== null) return
    restoreSession().then((next) => {
      if (cancelled) return
      if (next) setLocalToken(next)
      setRestoring(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ["me", token],
    queryFn: () => api.get<User>("/me"),
    enabled: token !== null,
    retry: false,
  })

  const signIn = useCallback(
    (newToken: string, user: User) => {
      setToken(newToken)
      setLocalToken(newToken)
      queryClient.setQueryData(["me", newToken], user)
    },
    [queryClient],
  )

  const signOut = useCallback(() => {
    void endSession()
    setLocalToken(null)
    queryClient.clear()
  }, [queryClient])

  // The api client cannot reach React state, so it says so through this and
  // the provider does the clearing up.
  useEffect(() => {
    setSessionLostHandler(() => {
      setLocalToken(null)
      queryClient.clear()
    })
  }, [queryClient])

  const value = useMemo<AuthValue>(
    () => ({
      user: token ? (data ?? null) : null,
      isLoading: restoring || (token !== null && isLoading),
      signIn,
      signOut,
    }),
    [token, data, isLoading, restoring, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider")
  return ctx
}
