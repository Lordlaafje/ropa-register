export interface RuntimeConfig {
  cognitoDomain: string
  clientId: string
  region: string
  apiBase: string
  callbackUrl: string
  logoutUrl: string
  identityProvider: string
  appName: string
}

let cached: RuntimeConfig = {
  cognitoDomain: '',
  clientId: '',
  region: 'eu-west-1',
  apiBase: '',
  callbackUrl: '',
  logoutUrl: '',
  identityProvider: 'GoogleWorkspace',
  appName: 'RoPA Register',
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' })
    if (response.ok) {
      const data = await response.json()
      cached = {
        cognitoDomain: data.cognitoDomain || '',
        clientId: data.clientId || '',
        region: data.region || 'eu-west-1',
        apiBase: data.apiBase || '',
        callbackUrl: data.callbackUrl || `${window.location.origin}/auth/callback`,
        logoutUrl: data.logoutUrl || `${window.location.origin}/`,
        identityProvider: data.identityProvider || 'GoogleWorkspace',
        appName: data.appName || 'RoPA Register',
      }
    }
  } catch {
    // fall through to defaults
  }
  return cached
}

export function getConfig(): RuntimeConfig {
  return cached
}
