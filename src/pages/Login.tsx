import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getConfig } from '@/lib/config'

export default function Login() {
  const { signIn, isConfigured } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const appName = getConfig().appName

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-md text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Sign-in disabled</h1>
          <p className="text-sm text-gray-600">Runtime config is missing Cognito settings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-sm w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">{appName}</h1>
        <p className="text-sm text-gray-600 mb-6">Use your organisation account to continue.</p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button
          type="button"
          onClick={async () => {
            try {
              await signIn()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Sign-in failed')
            }
          }}
          className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Continue with Google SSO
        </button>
      </div>
    </div>
  )
}
