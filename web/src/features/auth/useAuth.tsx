import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { api, getToken, setToken } from "@/lib/api"
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
 * The token is a plain 8h JWT with no refresh, so there is nothing to renew:
 * when /me starts returning 401 the session is simply over and the user signs
 * in again.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setLocalToken] = useState<string | null>(() => getToken())
  const queryClient = useQueryClient()

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
    setToken(null)
    setLocalToken(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<AuthValue>(
    () => ({
      user: token ? (data ?? null) : null,
      isLoading: token !== null && isLoading,
      signIn,
      signOut,
    }),
    [token, data, isLoading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider")
  return ctx
}
