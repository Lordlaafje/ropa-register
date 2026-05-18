import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { useAuth } from '@/context/AuthContext'

const PREF_KEY = 'ropa-new-transfer-preference'

type Pref = 'quick' | 'wizard' | null

function readPref(): Pref {
  try {
    const v = localStorage.getItem(PREF_KEY)
    if (v === 'quick' || v === 'wizard') return v
  } catch { /* ignore */ }
  return null
}

function setPref(v: Pref) {
  try { if (v) localStorage.setItem(PREF_KEY, v) } catch { /* ignore */ }
}

export default function NewTransferChoice() {
  const pref = readPref()
  const { me } = useAuth()
  const isReadOnly = me?.role === 'read'

  return (
    <AppShell>
      <Link to="/transfers" className="text-sm text-emerald-700 hover:text-emerald-800">← Back to transfers</Link>
      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New data transfer assessment</h1>
        <p className="text-sm text-slate-500 mt-1">Choose how you want to fill it in. Both produce the same record.</p>
      </div>

      {isReadOnly && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-md p-3">
          Your submission will be reviewed by the legal team before it goes live in the register.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChoiceCard
          to="/transfers/new/quick"
          title="Quick form"
          body="I know what to fill in. Show me everything on one page."
          highlighted={pref === 'quick'}
          onSelect={() => setPref('quick')}
        />
        <ChoiceCard
          to="/transfers/new/wizard"
          title="Guided wizard"
          body="Walk me through it step-by-step with plain-language questions."
          highlighted={pref === 'wizard'}
          onSelect={() => setPref('wizard')}
        />
      </div>
    </AppShell>
  )
}

function ChoiceCard({
  to, title, body, highlighted, onSelect,
}: { to: string; title: string; body: string; highlighted: boolean; onSelect: () => void }) {
  return (
    <Link
      to={to}
      onClick={onSelect}
      className={`block p-6 rounded-lg border transition-colors ${
        highlighted
          ? 'border-emerald-600 bg-emerald-50 hover:bg-emerald-100'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className={`text-base font-semibold ${highlighted ? 'text-emerald-800' : 'text-slate-900'}`}>{title}</div>
      <div className="text-sm text-slate-600 mt-1">{body}</div>
    </Link>
  )
}
