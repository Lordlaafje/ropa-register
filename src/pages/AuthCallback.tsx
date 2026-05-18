import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getSession } from '@/lib/auth'

export default function AuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { completeSso } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')
    const errorDescription = params.get('error_description')

    if (errorParam) {
      setError(errorDescription || 'Authentication failed')
      return
    }

    if (!code || !state) {
      navigate('/login', { replace: true })
      return
    }

    completeSso(code, state).then(async result => {
      if (result.error) {
        if (result.error === 'Invalid authentication state') {
          const session = await getSession()
          if (session) {
            navigate('/', { replace: true })
            return
          }
          navigate('/login', { replace: true })
          return
        }
        setError(result.error)
        return
      }
      navigate('/', { replace: true })
    })
  }, [completeSso, navigate, params])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border border-red-200 rounded-lg p-6 max-w-md text-center">
          <h1 className="text-lg font-semibold text-red-700 mb-2">Sign-in failed</h1>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Completing sign-in…</div>
    </div>
  )
}
