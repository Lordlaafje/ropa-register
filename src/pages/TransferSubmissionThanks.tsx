import { Link, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell'

export default function TransferSubmissionThanks() {
  const { id } = useParams<{ id: string }>()
  return (
    <AppShell>
      <div className="max-w-xl mx-auto mt-10 bg-white border border-slate-200 rounded-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900">Thanks — your submission is in review</h1>
        <p className="text-sm text-slate-600 mt-3">
          The legal team has been notified and will review your transfer assessment. You'll see it
          in the register once it has been approved.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {id && (
            <Link
              to={`/transfers/${encodeURIComponent(id)}`}
              className="px-3 py-2 rounded-md text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              View your submission
            </Link>
          )}
          <Link
            to="/transfers"
            className="px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Back to transfers
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
