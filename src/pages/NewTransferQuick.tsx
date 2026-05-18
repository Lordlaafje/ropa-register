import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import VendorQuickForm from '@/components/VendorQuickForm'

export default function NewTransferQuick() {
  return (
    <AppShell>
      <Link to="/transfers/new" className="text-sm text-emerald-700 hover:text-emerald-800">← Back</Link>
      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New transfer — quick form</h1>
        <p className="text-sm text-slate-500 mt-1">Fill in what you know. Save as draft anytime.</p>
      </div>
      <VendorQuickForm mode="create" />
    </AppShell>
  )
}
