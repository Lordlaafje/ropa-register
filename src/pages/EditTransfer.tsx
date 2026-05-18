import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import VendorQuickForm from '@/components/VendorQuickForm'
import { getTransfer } from '@/lib/api'
import type { VendorTransfer } from '@/lib/types'

export default function EditTransfer() {
  const { id } = useParams<{ id: string }>()
  const [transfer, setTransfer] = useState<VendorTransfer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    getTransfer(id)
      .then((t) => { if (!cancelled) setTransfer(t) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  if (loading) return <AppShell><div className="text-slate-500 text-sm">Loading…</div></AppShell>
  if (error || !transfer) {
    return (
      <AppShell>
        <Link to="/transfers" className="text-sm text-emerald-700 hover:text-emerald-800">← Back to transfers</Link>
        <div className="mt-6 bg-white border border-slate-200 rounded-lg p-8 text-center">
          <div className="text-slate-700 font-medium mb-1">Transfer not found</div>
          <div className="text-slate-500 text-sm">{error || 'No record exists for that id.'}</div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Link to={`/transfers/${encodeURIComponent(transfer.id)}`} className="text-sm text-emerald-700 hover:text-emerald-800">
        ← Back to record
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit: {transfer.toolName}</h1>
        <p className="text-sm text-slate-500 mt-1">Status: {transfer.status}</p>
      </div>
      <VendorQuickForm mode="edit" initial={transfer} />
    </AppShell>
  )
}
