import { getConfig } from './config'

export interface AuthUser {
  email: string
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
  idToken: string
  refreshToken?: string
  expiresAt: number
}

const SESSION_KEY = 'ropa-auth-session'
const PKCE_STATE_KEY = 'pkce_state'
const PKCE_VERIFIER_KEY = 'pkce_verifier'

const listeners = new Set<(user: AuthUser | null) => void>()

export async function signIn(): Promise<void> {
  const { clientId, cognitoDomain, callbackUrl, identityProvider } = getConfig()
  if (!clientId || !cognitoDomain || !callbackUrl) {
    throw new Error('Cognito Hosted UI is not configured')
  }

  const state = crypto.randomUUID()
  const verifier = generateVerifier()
  const challenge = base64UrlEncode(await sha256(verifier))

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  sessionStorage.setItem(PKCE_STATE_KEY, state)
  localStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  localStorage.setItem(PKCE_STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: callbackUrl,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    identity_provider: identityProvider,
  })

  window.location.assign(`${cognitoDomain}/oauth2/authorize?${params.toString()}`)
}

export async function completeSignIn(code: string, state: string): Promise<{ user: AuthUser | null; error: string | null }> {
  const { clientId, cognitoDomain, callbackUrl } = getConfig()
  if (!clientId || !cognitoDomain || !callbackUrl) {
    return { user: null, error: 'Cognito Hosted UI is not configured' }
  }

  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY) || localStorage.getItem(PKCE_STATE_KEY)
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY) || localStorage.getItem(PKCE_VERIFIER_KEY)
  if (!verifier || !expectedState || expectedState !== state) {
    return { user: null, error: 'Invalid authentication state' }
  }

  sessionStorage.removeItem(PKCE_STATE_KEY)
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  localStorage.removeItem(PKCE_STATE_KEY)
  localStorage.removeItem(PKCE_VERIFIER_KEY)

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: callbackUrl,
    code_verifier: verifier,
  })

  try {
    const response = await fetch(`${cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error_description || 'Authentication failed')
    }

    const session = buildSession({
      AccessToken: data.access_token,
      IdToken: data.id_token,
      RefreshToken: data.refresh_token,
      ExpiresIn: data.expires_in,
    })

    storeSession(session)
    notify(session.user)
    return { user: session.user, error: null }
  } catch (error) {
    return { user: null, error: normalizeError(error) }
  }
}

export async function signOut(): Promise<{ error: string | null }> {
  const { clientId, cognitoDomain, logoutUrl } = getConfig()
  clearSession()
  notify(null)

  if (cognitoDomain && clientId && logoutUrl) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: logoutUrl,
    })
    window.location.assign(`${cognitoDomain}/logout?${params.toString()}`)
  }

  return { error: null }
}

export async function getSession(): Promise<AuthSession | null> {
  const { clientId, cognitoDomain } = getConfig()
  const session = loadSession()
  if (!session) return null

  const now = Math.floor(Date.now() / 1000)
  if (session.expiresAt > now + 30) {
    return session
  }

  if (!session.refreshToken || !clientId || !cognitoDomain) {
    clearSession()
    notify(null)
    return null
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: session.refreshToken,
  })

  try {
    const response = await fetch(`${cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error_description || 'Token refresh failed')
    }

    const refreshed = buildSession({
      AccessToken: data.access_token,
      IdToken: data.id_token,
      RefreshToken: session.refreshToken,
      ExpiresIn: data.expires_in,
    }, session.refreshToken)

    storeSession(refreshed)
    notify(refreshed.user)
    return refreshed
  } catch {
    clearSession()
    notify(null)
    return null
  }
}

export async function getUser(): Promise<AuthUser | null> {
  const session = await getSession()
  return session?.user || null
}

export function onAuthStateChange(callback: (user: AuthUser | null) => void): (() => void) | undefined {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notify(user: AuthUser | null) {
  listeners.forEach(listener => listener(user))
}

function buildSession(result: { AccessToken: string; IdToken: string; RefreshToken?: string; ExpiresIn: number }, refreshOverride?: string): AuthSession {
  const idToken = result.IdToken
  const payload = decodeJwt(idToken)
  const email = typeof payload.email === 'string'
    ? payload.email
    : typeof payload['cognito:username'] === 'string'
      ? payload['cognito:username']
      : ''

  return {
    user: { email },
    accessToken: result.AccessToken,
    idToken,
    refreshToken: refreshOverride || result.RefreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + (result.ExpiresIn || 0),
  }
}

function storeSession(session: AuthSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function loadSession(): AuthSession | null {
  const data = sessionStorage.getItem(SESSION_KEY)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split('.')
    if (!payload) return {}
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return {}
  }
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Authentication error'
}

function generateVerifier(): string {
  const data = new Uint8Array(32)
  crypto.getRandomValues(data)
  return base64UrlEncode(data)
}

async function sha256(input: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  return crypto.subtle.digest('SHA-256', data)
}

function base64UrlEncode(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  bytes.forEach(b => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
