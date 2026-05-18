import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import QuickForm from '@/components/QuickForm'
import { getActivity } from '@/lib/api'
import type { Activity } from '@/lib/types'

export default function EditActivity() {
  const { id } = useParams<{ id: string }>()
  const [activity, setActivity] = useState<Activity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    getActivity(id)
      .then((a) => {
        if (!cancelled) setActivity(a)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <AppShell>
        <div className="text-slate-500 text-sm">Loading…</div>
      </AppShell>
    )
  }

  if (error || !activity) {
    return (
      <AppShell>
        <Link to="/" className="text-sm text-emerald-700 hover:text-emerald-800">← Back to register</Link>
        <div className="mt-6 bg-white border border-slate-200 rounded-lg p-8 text-center">
          <div className="text-slate-700 font-medium mb-1">Activity not found</div>
          <div className="text-slate-500 text-sm">{error || 'No record exists for that id.'}</div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Link to={`/activities/${encodeURIComponent(activity.id)}`} className="text-sm text-emerald-700 hover:text-emerald-800">
        ← Back to record
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit: {activity.activityName}</h1>
        <p className="text-sm text-slate-500 mt-1">Status: {activity.status}</p>
      </div>
      <QuickForm mode="edit" initial={activity} />
    </AppShell>
  )
}
