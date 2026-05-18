import { Link, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell'

export default function SubmissionThanks() {
  const { id } = useParams<{ id: string }>()
  return (
    <AppShell>
      <div className="max-w-xl mx-auto mt-10 bg-white border border-slate-200 rounded-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900">Thanks — your submission is in review</h1>
        <p className="text-sm text-slate-600 mt-3">
          The legal team has been notified and will review your submission. You'll see the
          activity in the register once it has been approved. They may come back to you with
          questions or send the submission back for edits.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {id && (
            <Link
              to={`/activities/${encodeURIComponent(id)}`}
              className="px-3 py-2 rounded-md text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              View your submission
            </Link>
          )}
          <Link
            to="/"
            className="px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Back to register
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
