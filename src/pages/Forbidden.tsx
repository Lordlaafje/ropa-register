import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'

export default function Forbidden() {
  return (
    <AppShell>
      <div className="max-w-lg mx-auto mt-12 bg-white border border-slate-200 rounded-lg p-8 text-center">
        <div className="text-slate-900 text-lg font-semibold mb-2">Edit access required</div>
        <p className="text-sm text-slate-600 mb-6">
          This action requires edit access. Contact an admin to be added to the editor list.
        </p>
        <Link
          to="/"
          className="inline-block px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Back to register
        </Link>
      </div>
    </AppShell>
  )
}
