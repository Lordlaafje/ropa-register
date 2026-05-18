import { useAuth } from '@/context/AuthContext'

export default function Placeholder() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">RoPA — coming soon</h1>
        <p className="text-sm text-gray-600 mb-6">
          You're signed in as <span className="font-medium text-gray-900">{user?.email}</span>.
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
