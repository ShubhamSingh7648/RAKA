import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type AuthUser = {
  _id: string
  username: string
  email: string
  bio?: string
  displayPicture?: string
  createdAt?: string
  updatedAt?: string
}

type AuthContextValue = {
  token: string
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  refreshProfile: () => Promise<void>
  setAuthToken: (nextToken: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

async function fetchMe(token: string): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/me`, {
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = new Error('Failed to fetch profile')
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  const payload = (await response.json()) as { data?: AuthUser | null }
  return payload?.data || null
}

async function silentRefresh(): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as { data?: { accessToken?: string } }
  const nextToken = payload?.data?.accessToken || ''
  if (!nextToken) return null

  localStorage.setItem('jwt', nextToken)
  return nextToken
}

function clearStoredAuth() {
  localStorage.removeItem('jwt')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string>(() => localStorage.getItem('jwt') || '')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const currentToken = localStorage.getItem('jwt') || ''
    setToken(currentToken)

    if (!currentToken) {
      setUser(null)
      setIsLoading(false)
      return
    }
    try {
      const me = await fetchMe(currentToken)
      setUser(me)
      setIsLoading(false)
      return
    } catch (error) {
      const status = (error as Error & { status?: number })?.status
      if (status !== 401) {
        setUser(null)
        setIsLoading(false)
        return
      }
    }

    const refreshedToken = await silentRefresh()
    if (!refreshedToken) {
      clearStoredAuth()
      setToken('')
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const me = await fetchMe(refreshedToken)
      setToken(refreshedToken)
      setUser(me)
    } catch {
      clearStoredAuth()
      setToken('')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setAuthToken = useCallback((nextToken: string) => {
    localStorage.setItem('jwt', nextToken)
    setToken(nextToken)
  }, [])

  const logout = useCallback(() => {
    clearStoredAuth()
    setToken('')
    setUser(null)
  }, [])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  useEffect(() => {
    const syncToken = () => {
      const nextToken = localStorage.getItem('jwt') || ''
      setToken((prevToken) => (prevToken === nextToken ? prevToken : nextToken))
    }

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'jwt') syncToken()
    }

    const onFocus = () => syncToken()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncToken()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }
    void refreshProfile()
  }, [token, refreshProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isLoading,
      isAuthenticated: Boolean(token && user),
      refreshProfile,
      setAuthToken,
      logout,
    }),
    [isLoading, logout, refreshProfile, setAuthToken, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
