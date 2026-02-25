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
  createdAt?: string
  updatedAt?: string
}

type AuthContextValue = {
  token: string
  user: AuthUser | null
  isAuthenticated: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

async function fetchMe(token: string): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as { data?: AuthUser | null }
  return payload?.data || null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string>(() => localStorage.getItem('jwt') || '')
  const [user, setUser] = useState<AuthUser | null>(null)

  const refreshProfile = useCallback(async () => {
    const currentToken = localStorage.getItem('jwt') || ''
    setToken(currentToken)

    if (!currentToken) {
      setUser(null)
      return
    }

    const me = await fetchMe(currentToken)
    setUser(me)
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

    const intervalId = window.setInterval(syncToken, 1000)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
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
      isAuthenticated: Boolean(token && user),
      refreshProfile,
    }),
    [refreshProfile, token, user],
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
