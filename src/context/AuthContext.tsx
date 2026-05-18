import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { AuthUser, signIn as authSignIn, signOut as authSignOut, getSession, onAuthStateChange, completeSignIn } from '@/lib/auth'
import { isApiConfigured, getMe } from '@/lib/api'
import type { Me } from '@/lib/types'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: () => Promise<void>
  completeSso: (code: string, state: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  isConfigured: boolean
  me: Me | null
  meLoading: boolean
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Me | null>(null)
  const [meLoading, setMeLoading] = useState(false)
  const isConfigured = isApiConfigured()

  const refreshMe = useCallback(async () => {
    setMeLoading(true)
    try {
      const next = await getMe()
      setMe(next)
    } catch (err) {
      console.warn('Failed to load /api/me', err)
      setMe(null)
    } finally {
      setMeLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }

    getSession().then((session) => {
      setUser(session?.user || null)
      setLoading(false)
    })

    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser)
      setLoading(false)
    })

    return () => {
      unsubscribe?.()
    }
  }, [isConfigured])

  useEffect(() => {
    if (user) {
      refreshMe()
    } else {
      setMe(null)
    }
  }, [user, refreshMe])

  const signIn = async () => {
    await authSignIn()
  }

  const completeSso = async (code: string, state: string) => {
    const result = await completeSignIn(code, state)
    if (result.user) {
      setUser(result.user)
    }
    return { error: result.error }
  }

  const signOut = async () => {
    await authSignOut()
    setUser(null)
    setMe(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, completeSso, signOut, isConfigured, me, meLoading, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useMe(): Me | null {
  return useAuth().me
}
