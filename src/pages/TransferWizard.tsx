import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import ChipSelect from '@/components/ChipSelect'
import FormField from '@/components/FormField'
import { createTransfer, ValidationError, type VendorInput } from '@/lib/api'
import {
  DATA_LOCATIONS,
  DATA_LOCATION_LABELS,
  TRANSFER_MECHANISMS_V2,
  TRANSFER_MECHANISM_V2_DESCRIPTIONS,
  DPA_STATUSES,
  DPA_STATUS_LABELS,
  TIA_STATUSES,
  TIA_STATUS_LABELS,
  PERSONAL_DATA_CATEGORIES,
  DATA_SUBJECT_CATEGORIES,
} from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import type { DataLocation, DpaStatus, TiaStatus, TransferMechanismV2 } from '@/lib/types'

const WIZARD_KEY = 'ropa-transfer-wizard-draft'

interface WizardState {
  step: number
  draft: VendorInput
  pdAns: 'yes' | 'no' | 'unsure' | undefined
}

function emptyDraft(): VendorInput {
  return {
    toolName: '',
    vendorName: '',
    description: '',
    processesPersonalData: false,
    dataCategories: [],
    dataSubjects: [],
    dataLocation: 'Unknown',
    dataLocationDetail: '',
    transferMechanism: undefined,
    dpaStatus: 'missing',
    dpaSignedDate: '',
    dpaUrl: '',
    tiaStatus: 'not_assessed',
    tiaNotes: '',
    linkedActivityIds: [],
    ownerName: '',
    ownerEmail: '',
    notes: '',
    needsLegalReview: false,
  }
}

function loadState(): WizardState {
  try {
    const raw = localStorage.getItem(WIZARD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.draft) {
        return {
          step: parsed.step || 1,
          draft: { ...emptyDraft(), ...parsed.draft },
          pdAns: parsed.pdAns,
        }
      }
    }
  } catch { /* ignore */ }
  return { step: 1, draft: emptyDraft(), pdAns: undefined }
}

export default function TransferWizard() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const isReadOnly = me?.role === 'read'
  const [state, setState] = useState<WizardState>(() => loadState())
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(WIZARD_KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])

  function update<K extends keyof VendorInput>(key: K, value: VendorInput[K]) {
    setState((s) => ({ ...s, draft: { ...s.draft, [key]: value } }))
  }

  function setStep(n: number) {
    setState((s) => ({ ...s, step: Math.max(1, Math.min(6, n)) }))
  }

  function clearWizard() {
    try { localStorage.removeItem(WIZARD_KEY) } catch { /* ignore */ }
  }

  function validateStep(step: number): string | null {
    const d = state.draft
    if (step === 1) {
      if (!d.toolName?.trim()) return 'Give the tool a name.'
      if (!d.ownerEmail?.includes('@')) return 'A valid owner email is needed.'
    }
    if (step === 2) {
      if (state.pdAns === undefined) return 'Answer the personal-data question.'
    }
    if (step === 3) {
      if (!d.dataLocation) return 'Pick a data location.'
    }
    if (step === 4) {
      // mechanism is optional but encouraged
    }
    return null
  }

  function next() {
    const err = validateStep(state.step)
    if (err) { setError(err); return }
    setError(null)
    if (state.step === 2) {
      // sync the pd answer into the draft
      const isYes = state.pdAns === 'yes'
      const needsReview = state.pdAns === 'unsure' || !!state.draft.needsLegalReview
      setState((s) => ({
        ...s,
        step: 3,
        draft: { ...s.draft, processesPersonalData: isYes, needsLegalReview: needsReview },
      }))
      return
    }
    setStep(state.step + 1)
  }

  function back() { setError(null); setStep(state.step - 1) }

  async function submit() {
    setSaving(true); setError(null); setValidationErrors({})
    try {
      const targetStatus: 'active' | 'pending_review' = isReadOnly ? 'pending_review' : 'active'
      const payload: VendorInput = { ...state.draft, status: targetStatus }
      const result = await createTransfer(payload)
      clearWizard()
      if (isReadOnly) navigate(`/transfer-submission-thanks/${encodeURIComponent(result.id)}`)
      else navigate(`/transfers/${encodeURIComponent(result.id)}`)
    } catch (err) {
      if (err instanceof ValidationError) {
        setValidationErrors(err.errors)
        setError('Some fields need attention. Use Edit to fix them.')
      } else {
        setError(err instanceof Error ? err.message : 'Submit failed')
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveAndExit() {
    setSaving(true); setError(null)
    try {
      const result = await createTransfer({ ...state.draft, status: 'draft' })
      clearWizard()
      navigate(`/transfers/${encodeURIComponent(result.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const d = state.draft

  return (
    <AppShell>
      <Link to="/transfers/new" className="text-sm text-emerald-700 hover:text-emerald-800">← Back</Link>

      <div className="mt-4 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New transfer — guided</h1>
          <p className="text-sm text-slate-500 mt-1">Step {Math.min(state.step, 5)} of 5{state.step === 6 ? ' · Review' : ''}</p>
        </div>
        {!isReadOnly && (
          <button type="button" onClick={saveAndExit} disabled={saving} className="text-sm text-slate-600 hover:text-slate-900 underline">
            Save and finish later
          </button>
        )}
      </div>

      {isReadOnly && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-md p-3">
          Your submission will be reviewed by the legal team before it goes live in the register.
        </div>
      )}

      <div className="bg-slate-200 rounded-full h-1.5 mb-6 overflow-hidden">
        <div className="bg-emerald-600 h-full transition-all" style={{ width: `${(Math.min(state.step, 6) / 6) * 100}%` }} />
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3 mb-4">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        {state.step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">What's the tool?</h2>
            <FormField label="Tool name" required>
              <input type="text" value={d.toolName || ''} onChange={(e) => update('toolName', e.target.value)} className={cls} placeholder="e.g. Zendesk" />
            </FormField>
            <FormField label="Vendor legal entity (contracting party)">
              <input type="text" value={d.vendorName || ''} onChange={(e) => update('vendorName', e.target.value)} className={cls} placeholder="e.g. Zendesk Inc." />
            </FormField>
            <FormField label="What does it do?">
              <textarea value={d.description || ''} onChange={(e) => update('description', e.target.value)} className={`${cls} min-h-[80px]`} />
            </FormField>
            <FormField label="Owner name">
              <input type="text" value={d.ownerName || ''} onChange={(e) => update('ownerName', e.target.value)} className={cls} />
            </FormField>
            <FormField label="Owner email" required>
              <input type="email" value={d.ownerEmail || ''} onChange={(e) => update('ownerEmail', e.target.value)} className={cls} placeholder="owner@example.com" />
            </FormField>
          </div>
        )}

        {state.step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">Does this tool process personal data?</h2>
            <TriPicker
              value={state.pdAns}
              onChange={(v) => setState((s) => ({ ...s, pdAns: v }))}
            />
            {state.pdAns === 'yes' && (
              <>
                <FormField label="What kinds of personal data?">
                  <ChipSelect options={PERSONAL_DATA_CATEGORIES} value={d.dataCategories || []} onChange={(v) => update('dataCategories', v)} />
                </FormField>
                <FormField label="Whose data is it?">
                  <ChipSelect options={DATA_SUBJECT_CATEGORIES} value={d.dataSubjects || []} onChange={(v) => update('dataSubjects', v)} />
                </FormField>
              </>
            )}
          </div>
        )}

        {state.step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">Where does the data go?</h2>
            <FormField label="Pick a location" required>
              <div className="space-y-2">
                {DATA_LOCATIONS.map((l) => {
                  const on = d.dataLocation === l
                  return (
                    <button
                      type="button"
                      key={l}
                      onClick={() => update('dataLocation', l as DataLocation)}
                      className={`w-full text-left px-3 py-2 rounded-md border ${on ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="text-sm font-medium text-slate-900">{DATA_LOCATION_LABELS[l]}</div>
                    </button>
                  )
                })}
              </div>
            </FormField>
            <FormField label="Detail (optional)" hint="e.g. 'Ireland, accessible from US'">
              <input type="text" value={d.dataLocationDetail || ''} onChange={(e) => update('dataLocationDetail', e.target.value)} className={cls} />
            </FormField>
          </div>
        )}

        {state.step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">What's the legal basis for the transfer?</h2>
            <div className="space-y-2">
              {TRANSFER_MECHANISMS_V2.map((m) => {
                const on = d.transferMechanism === m
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => update('transferMechanism', m as TransferMechanismV2)}
                    className={`w-full text-left px-3 py-2 rounded-md border ${on ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="text-sm font-medium text-slate-900">{m}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{TRANSFER_MECHANISM_V2_DESCRIPTIONS[m]}</div>
                  </button>
                )
              })}
            </div>
            {d.transferMechanism === 'Other' && (
              <div className="text-xs text-amber-700">Selecting "Other" flags the record for legal review.</div>
            )}
          </div>
        )}

        {state.step === 5 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">DPA & TIA status</h2>
            <FormField label="DPA status">
              <select
                value={d.dpaStatus || 'missing'}
                onChange={(e) => update('dpaStatus', e.target.value as DpaStatus)}
                className={cls}
              >
                {DPA_STATUSES.map((s) => <option key={s} value={s}>{DPA_STATUS_LABELS[s]}</option>)}
              </select>
            </FormField>
            <FormField label="DPA link / reference">
              <input type="text" value={d.dpaUrl || ''} onChange={(e) => update('dpaUrl', e.target.value)} className={cls} />
            </FormField>
            <FormField label="TIA status">
              <select
                value={d.tiaStatus || 'not_assessed'}
                onChange={(e) => update('tiaStatus', e.target.value as TiaStatus)}
                className={cls}
              >
                {TIA_STATUSES.map((s) => <option key={s} value={s}>{TIA_STATUS_LABELS[s]}</option>)}
              </select>
            </FormField>
            <FormField label="TIA notes">
              <textarea value={d.tiaNotes || ''} onChange={(e) => update('tiaNotes', e.target.value)} className={`${cls} min-h-[60px]`} />
            </FormField>
          </div>
        )}

        {state.step === 6 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">Review and submit</h2>
            {Object.entries(validationErrors).length > 0 && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3">
                <div className="font-medium mb-1">Server-side validation issues:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {Object.entries(validationErrors).map(([k, v]) => (
                    <li key={k}><span className="font-medium">{k}:</span> {v}</li>
                  ))}
                </ul>
              </div>
            )}
            <ReviewBlock title="Tool" onEdit={() => setStep(1)}>
              <KV label="Name" v={d.toolName} />
              <KV label="Vendor" v={d.vendorName || '—'} />
              <KV label="Owner" v={[d.ownerName, d.ownerEmail].filter(Boolean).join(' · ')} />
            </ReviewBlock>
            <ReviewBlock title="Personal data" onEdit={() => setStep(2)}>
              <KV label="Processes personal data" v={d.processesPersonalData ? 'Yes' : 'No'} />
              <KV label="Categories" v={(d.dataCategories || []).join(', ') || '—'} />
              <KV label="Subjects" v={(d.dataSubjects || []).join(', ') || '—'} />
            </ReviewBlock>
            <ReviewBlock title="Location" onEdit={() => setStep(3)}>
              <KV label="Location" v={DATA_LOCATION_LABELS[d.dataLocation as DataLocation] || d.dataLocation || '—'} />
              <KV label="Detail" v={d.dataLocationDetail || '—'} />
            </ReviewBlock>
            <ReviewBlock title="Transfer mechanism" onEdit={() => setStep(4)}>
              <KV label="Mechanism" v={d.transferMechanism || '—'} />
            </ReviewBlock>
            <ReviewBlock title="DPA & TIA" onEdit={() => setStep(5)}>
              <KV label="DPA" v={DPA_STATUS_LABELS[d.dpaStatus as DpaStatus] || d.dpaStatus || '—'} />
              <KV label="TIA" v={TIA_STATUS_LABELS[d.tiaStatus as TiaStatus] || d.tiaStatus || '—'} />
              {d.tiaNotes && <KV label="TIA notes" v={d.tiaNotes} />}
            </ReviewBlock>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          {state.step > 1 && (
            <button type="button" onClick={back} disabled={saving} className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50">
              ← Back
            </button>
          )}
        </div>
        <div>
          {state.step < 6 ? (
            <button type="button" onClick={next} className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700">
              {state.step === 5 ? 'Review →' : 'Next →'}
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={submit} className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Submitting…' : isReadOnly ? 'Submit for review' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  )
}

const cls = 'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'

function TriPicker({
  value, onChange,
}: { value: 'yes' | 'no' | 'unsure' | undefined; onChange: (v: 'yes' | 'no' | 'unsure') => void }) {
  const opts: { v: 'yes' | 'no' | 'unsure'; label: string }[] = [
    { v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }, { v: 'unsure', label: "I'm not sure" },
  ]
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const on = value === o.v
          return (
            <button
              type="button"
              key={o.v}
              onClick={() => onChange(o.v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ring-1 ring-inset ${
                on
                  ? o.v === 'unsure'
                    ? 'bg-amber-500 text-white ring-amber-500'
                    : 'bg-emerald-600 text-white ring-emerald-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {value === 'unsure' && <div className="text-xs text-amber-700 mt-1">This will flag the record for legal review.</div>}
    </div>
  )
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <button type="button" onClick={onEdit} className="text-xs text-emerald-700 hover:text-emerald-800">Edit</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">{children}</div>
    </div>
  )
}

function KV({ label, v }: { label: string; v: string | undefined }) {
  return (
    <div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{v || '—'}</div>
    </div>
  )
}
