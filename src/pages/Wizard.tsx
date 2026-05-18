import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import ChipSelect from '@/components/ChipSelect'
import FormField from '@/components/FormField'
import { createActivity, ValidationError, type ActivityInput } from '@/lib/api'
import {
  DEPARTMENTS,
  LAWFUL_BASIS_OPTIONS,
  DATA_SUBJECT_CATEGORIES,
  PERSONAL_DATA_CATEGORIES,
  STANDARD_TOMS,
  TRANSFER_MECHANISMS,
} from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import type { LawfulBasis, TransferMechanism } from '@/lib/types'

const WIZARD_KEY = 'ropa-wizard-draft'

type TriState = 'yes' | 'no' | 'unsure' | undefined

interface WizardState {
  step: number
  draft: ActivityInput
  childrenAns: TriState
  specialAns: TriState
  transfersAns: 'yes' | 'no' | undefined
  aiAns: 'yes' | 'no' | undefined
}

const LAWFUL_BASIS_DESCRIPTIONS: Record<LawfulBasis, string> = {
  Contract: 'We need this to deliver our service to the user.',
  Consent: 'The user has actively given permission for this.',
  'Legitimate interests': 'We have a real business interest that is balanced against user rights.',
  'Legal obligation': 'A law requires us to process this data.',
  'Vital interests': "Someone's life or safety depends on it.",
  'Public task': 'A task carried out in the public interest.',
}

function emptyDraft(): ActivityInput {
  return {
    activityName: '',
    purposeShort: '',
    purposeFull: '',
    department: '',
    ownerName: '',
    ownerEmail: '',
    controllerRole: 'controller',
    systemsVendors: [],
    recipients: [],
    dataSubjects: [],
    personalDataCategories: [],
    lawfulBasis: 'Legitimate interests',
    retentionPeriod: '',
    retentionNotes: '',
    internationalTransfers: false,
    transferCountries: [],
    childrensData: false,
    specialCategoryData: false,
    aiInvolvement: false,
    tomsChecklist: [...STANDARD_TOMS.slice(0, 5)],
    needsLegalReview: false,
    dpiaStatus: 'not_assessed',
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
          childrenAns: parsed.childrenAns,
          specialAns: parsed.specialAns,
          transfersAns: parsed.transfersAns,
          aiAns: parsed.aiAns,
        }
      }
    }
  } catch {
    // ignore
  }
  return { step: 1, draft: emptyDraft(), childrenAns: undefined, specialAns: undefined, transfersAns: undefined, aiAns: undefined }
}

export default function Wizard() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const isReadOnly = me?.role === 'read'
  const tomsLibrary = (me?.tomsLibrary && me.tomsLibrary.length ? me.tomsLibrary : STANDARD_TOMS) as readonly string[]
  const [state, setState] = useState<WizardState>(() => loadState())
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(WIZARD_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state])

  function update<K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) {
    setState((s) => ({ ...s, draft: { ...s.draft, [key]: value } }))
  }

  function setStep(n: number) {
    setState((s) => ({ ...s, step: Math.max(1, Math.min(5, n)) }))
  }

  function clearWizard() {
    try {
      localStorage.removeItem(WIZARD_KEY)
    } catch {
      // ignore
    }
  }

  // Auto-fill children's data toggle if the children data-subject category is selected
  useEffect(() => {
    const subs = state.draft.dataSubjects || []
    if (subs.includes('Children (under 16)') && !state.draft.childrensData) {
      setState((s) => ({ ...s, draft: { ...s.draft, childrensData: true } }))
    }
  }, [state.draft.dataSubjects, state.draft.childrensData])

  function validateStep(step: number): string | null {
    const d = state.draft
    if (step === 1) {
      if (!d.activityName?.trim()) return 'Give it a name.'
      if (!d.purposeShort?.trim()) return 'A one-sentence description is needed.'
      if (!d.department) return 'Pick a department.'
      if (!d.ownerEmail?.includes('@')) return 'A valid owner email is needed.'
    }
    if (step === 2) {
      if (!(d.dataSubjects && d.dataSubjects.length)) return 'Pick at least one data subject group.'
      if (!(d.personalDataCategories && d.personalDataCategories.length)) return 'Pick at least one data category.'
    }
    if (step === 3) {
      if (!d.lawfulBasis) return 'Pick a lawful basis.'
      if (!d.retentionPeriod?.trim()) return 'Say how long you keep the data.'
    }
    if (step === 4) {
      if (state.childrenAns === undefined) return 'Answer the children question.'
      if (state.specialAns === undefined) return 'Answer the special-category question.'
      if (state.transfersAns === undefined) return 'Answer the transfers question.'
      if (state.aiAns === undefined) return 'Answer the AI question.'
    }
    return null
  }

  function next() {
    const err = validateStep(state.step)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    if (state.step === 4) {
      // moving to review screen — sync answers into draft
      const needsReview =
        state.childrenAns === 'unsure' || state.specialAns === 'unsure' || !!state.draft.needsLegalReview
      setState((s) => ({
        ...s,
        step: 5,
        draft: {
          ...s.draft,
          childrensData: state.childrenAns === 'yes' || s.draft.childrensData,
          specialCategoryData: state.specialAns === 'yes',
          internationalTransfers: state.transfersAns === 'yes',
          aiInvolvement: state.aiAns === 'yes',
          needsLegalReview: needsReview,
        },
      }))
    } else {
      setStep(state.step + 1)
    }
  }

  function back() {
    setError(null)
    setStep(state.step - 1)
  }

  async function saveAndExit() {
    setSaving(true)
    setError(null)
    try {
      const payload: ActivityInput = { ...state.draft, status: 'draft' }
      const result = await createActivity(payload)
      clearWizard()
      navigate(`/activities/${encodeURIComponent(result.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function submit() {
    setSaving(true)
    setError(null)
    setValidationErrors({})
    try {
      const targetStatus: 'active' | 'pending_review' = isReadOnly ? 'pending_review' : 'active'
      const payload: ActivityInput = { ...state.draft, status: targetStatus }
      const result = await createActivity(payload)
      clearWizard()
      if (isReadOnly) {
        navigate(`/submission-thanks/${encodeURIComponent(result.id)}`)
      } else {
        navigate(`/activities/${encodeURIComponent(result.id)}`)
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        setValidationErrors(err.errors)
        setError('Some fields need attention. Use the Edit links below to fix them.')
      } else {
        setError(err instanceof Error ? err.message : 'Submit failed')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <Link to="/activities/new" className="text-sm text-emerald-700 hover:text-emerald-800">← Back</Link>

      <div className="mt-4 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New activity — guided</h1>
          <p className="text-sm text-slate-500 mt-1">Step {Math.min(state.step, 4)} of 4{state.step === 5 ? ' · Review' : ''}</p>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            onClick={saveAndExit}
            disabled={saving}
            className="text-sm text-slate-600 hover:text-slate-900 underline"
          >
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
        <div
          className="bg-emerald-600 h-full transition-all"
          style={{ width: `${(Math.min(state.step, 5) / 5) * 100}%` }}
        />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3 mb-4">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        {state.step === 1 && <Step1 state={state} update={update} />}
        {state.step === 2 && <Step2 state={state} update={update} />}
        {state.step === 3 && <Step3 state={state} update={update} />}
        {state.step === 4 && <Step4 state={state} setState={setState} update={update} tomsLibrary={tomsLibrary} />}
        {state.step === 5 && (
          <Review
            state={state}
            errors={validationErrors}
            jumpTo={(s) => setStep(s)}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          {state.step > 1 && (
            <button
              type="button"
              onClick={back}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
            >
              ← Back
            </button>
          )}
        </div>
        <div>
          {state.step < 5 ? (
            <button
              type="button"
              onClick={next}
              className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {state.step === 4 ? 'Review →' : 'Next →'}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Submitting…' : isReadOnly ? 'Submit for review' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function Step1({
  state,
  update,
}: {
  state: WizardState
  update: <K extends keyof ActivityInput>(k: K, v: ActivityInput[K]) => void
}) {
  const d = state.draft
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">What is it, and who's doing it?</h2>
      <FormField label="Give it a clear name" required>
        <input
          type="text"
          value={d.activityName || ''}
          onChange={(e) => update('activityName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="e.g. Customer support ticket handling"
        />
      </FormField>
      <FormField label="Describe in one sentence what this is" required>
        <input
          type="text"
          value={d.purposeShort || ''}
          onChange={(e) => update('purposeShort', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </FormField>
      <FormField label="Which department owns this?" required>
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENTS.map((dep) => {
            const on = d.department === dep
            return (
              <button
                type="button"
                key={dep}
                onClick={() => update('department', dep)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${
                  on
                    ? 'bg-emerald-600 text-white ring-emerald-600'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {dep}
              </button>
            )
          })}
        </div>
      </FormField>
      <FormField label="Owner name" hint="The colleague responsible for this activity.">
        <input
          type="text"
          value={d.ownerName || ''}
          onChange={(e) => update('ownerName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="Full name"
        />
      </FormField>
      <FormField label="Owner email" hint="Their work email." required>
        <input
          type="email"
          value={d.ownerEmail || ''}
          onChange={(e) => update('ownerEmail', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="owner@example.com"
        />
      </FormField>
    </div>
  )
}

function Step2({
  state,
  update,
}: {
  state: WizardState
  update: <K extends keyof ActivityInput>(k: K, v: ActivityInput[K]) => void
}) {
  const d = state.draft
  const childrenSelected = (d.dataSubjects || []).includes('Children (under 16)')
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">Whose data, and what data?</h2>
      <FormField label="Whose personal data is involved?" required>
        <ChipSelect
          options={DATA_SUBJECT_CATEGORIES}
          value={d.dataSubjects || []}
          onChange={(v) => update('dataSubjects', v)}
        />
      </FormField>
      {childrenSelected && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md p-3">
          Children selected — children's data flag has been set automatically (Art. 8 GDPR).
        </div>
      )}
      <FormField label="What kinds of data are you processing?" required>
        <ChipSelect
          options={PERSONAL_DATA_CATEGORIES}
          value={d.personalDataCategories || []}
          onChange={(v) => update('personalDataCategories', v)}
        />
      </FormField>
    </div>
  )
}

function Step3({
  state,
  update,
}: {
  state: WizardState
  update: <K extends keyof ActivityInput>(k: K, v: ActivityInput[K]) => void
}) {
  const d = state.draft
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">Why and how?</h2>
      <FormField label="What's the purpose?" hint="A few sentences — the why.">
        <textarea
          value={d.purposeFull || ''}
          onChange={(e) => update('purposeFull', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 min-h-[100px]"
        />
      </FormField>
      <FormField label="What's the legal basis?" required>
        <div className="space-y-2">
          {LAWFUL_BASIS_OPTIONS.map((lb) => {
            const on = d.lawfulBasis === lb
            return (
              <button
                type="button"
                key={lb}
                onClick={() => update('lawfulBasis', lb)}
                className={`w-full text-left px-3 py-2 rounded-md border ${
                  on ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-medium text-slate-900">{lb}</div>
                <div className="text-xs text-slate-500 mt-0.5">{LAWFUL_BASIS_DESCRIPTIONS[lb]}</div>
              </button>
            )
          })}
        </div>
      </FormField>
      <FormField label="Where does the data go?" hint="Recipients — internal teams or external parties.">
        <ChipSelect
          options={[]}
          value={d.recipients || []}
          onChange={(v) => update('recipients', v)}
          placeholder="Add a recipient…"
        />
      </FormField>
      <FormField label="How long do you keep it?" required>
        <input
          type="text"
          value={d.retentionPeriod || ''}
          onChange={(e) => update('retentionPeriod', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="e.g. 7 years after contract end"
        />
      </FormField>
      <FormField label="Notes on retention (optional)">
        <textarea
          value={d.retentionNotes || ''}
          onChange={(e) => update('retentionNotes', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 min-h-[60px]"
        />
      </FormField>
    </div>
  )
}

function Step4({
  state,
  setState,
  update,
  tomsLibrary,
}: {
  state: WizardState
  setState: React.Dispatch<React.SetStateAction<WizardState>>
  update: <K extends keyof ActivityInput>(k: K, v: ActivityInput[K]) => void
  tomsLibrary: readonly string[]
}) {
  const d = state.draft
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">Risks and flags</h2>
      <TriPicker
        label="Does this involve children under 16?"
        value={state.childrenAns}
        onChange={(v) => setState((s) => ({ ...s, childrenAns: v }))}
      />
      <TriPicker
        label="Does this involve sensitive data (health, ethnicity, biometrics)?"
        value={state.specialAns}
        onChange={(v) => setState((s) => ({ ...s, specialAns: v }))}
      />
      <BinaryPicker
        label="Is data sent outside the EU/EEA?"
        value={state.transfersAns}
        onChange={(v) => setState((s) => ({ ...s, transfersAns: v }))}
      />
      {state.transfersAns === 'yes' && (
        <div className="pl-4 border-l-2 border-emerald-200 space-y-3">
          <FormField label="Transfer mechanism">
            <select
              value={d.transferMechanism || ''}
              onChange={(e) => update('transferMechanism', (e.target.value || undefined) as TransferMechanism | undefined)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              <option value="">Select…</option>
              {TRANSFER_MECHANISMS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Which countries?">
            <ChipSelect
              options={[]}
              value={d.transferCountries || []}
              onChange={(v) => update('transferCountries', v)}
              placeholder="e.g. US"
            />
          </FormField>
        </div>
      )}
      <BinaryPicker
        label="Is AI involved?"
        value={state.aiAns}
        onChange={(v) => setState((s) => ({ ...s, aiAns: v }))}
      />
      <FormField label="What security measures apply?" hint="Pre-checked from defaults — adjust as needed.">
        <ChipSelect
          options={tomsLibrary}
          value={d.tomsChecklist || []}
          onChange={(v) => update('tomsChecklist', v)}
        />
      </FormField>
    </div>
  )
}

function TriPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: TriState
  onChange: (v: TriState) => void
}) {
  const opts: { v: 'yes' | 'no' | 'unsure'; label: string }[] = [
    { v: 'yes', label: 'Yes' },
    { v: 'no', label: 'No' },
    { v: 'unsure', label: "I'm not sure" },
  ]
  return (
    <div>
      <div className="block text-sm font-medium text-slate-700 mb-2">{label}</div>
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
      {value === 'unsure' && (
        <div className="text-xs text-amber-700 mt-1">This will flag the record for legal review.</div>
      )}
    </div>
  )
}

function BinaryPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: 'yes' | 'no' | undefined
  onChange: (v: 'yes' | 'no') => void
}) {
  const opts: { v: 'yes' | 'no'; label: string }[] = [
    { v: 'yes', label: 'Yes' },
    { v: 'no', label: 'No' },
  ]
  return (
    <div>
      <div className="block text-sm font-medium text-slate-700 mb-2">{label}</div>
      <div className="flex gap-2">
        {opts.map((o) => {
          const on = value === o.v
          return (
            <button
              type="button"
              key={o.v}
              onClick={() => onChange(o.v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ring-1 ring-inset ${
                on
                  ? 'bg-emerald-600 text-white ring-emerald-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Review({
  state,
  errors,
  jumpTo,
}: {
  state: WizardState
  errors: Record<string, string>
  jumpTo: (step: number) => void
}) {
  const d = state.draft
  const errorList = Object.entries(errors)
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">Review your record</h2>
      {errorList.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3">
          <div className="font-medium mb-1">Server-side validation issues:</div>
          <ul className="list-disc list-inside space-y-0.5">
            {errorList.map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}:</span> {v}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ReviewBlock title="Basics" onEdit={() => jumpTo(1)}>
        <KV label="Name" v={d.activityName} />
        <KV label="Purpose (short)" v={d.purposeShort} />
        <KV label="Department" v={d.department} />
        <KV label="Owner" v={[d.ownerName, d.ownerEmail].filter(Boolean).join(' · ')} />
      </ReviewBlock>
      <ReviewBlock title="Data" onEdit={() => jumpTo(2)}>
        <KV label="Data subjects" v={(d.dataSubjects || []).join(', ')} />
        <KV label="Data categories" v={(d.personalDataCategories || []).join(', ')} />
      </ReviewBlock>
      <ReviewBlock title="Why & how" onEdit={() => jumpTo(3)}>
        <KV label="Full purpose" v={d.purposeFull || '—'} />
        <KV label="Lawful basis" v={d.lawfulBasis} />
        <KV label="Recipients" v={(d.recipients || []).join(', ') || '—'} />
        <KV label="Retention" v={d.retentionPeriod} />
        {d.retentionNotes && <KV label="Retention notes" v={d.retentionNotes} />}
      </ReviewBlock>
      <ReviewBlock title="Risks & flags" onEdit={() => jumpTo(4)}>
        <KV label="Children's data" v={d.childrensData ? 'Yes' : 'No'} />
        <KV label="Special category data" v={d.specialCategoryData ? 'Yes' : 'No'} />
        <KV label="International transfers" v={d.internationalTransfers ? 'Yes' : 'No'} />
        {d.internationalTransfers && (
          <>
            <KV label="Mechanism" v={d.transferMechanism || '—'} />
            <KV label="Countries" v={(d.transferCountries || []).join(', ') || '—'} />
          </>
        )}
        <KV label="AI involvement" v={d.aiInvolvement ? 'Yes' : 'No'} />
        <KV label="Security measures" v={(d.tomsChecklist || []).join(', ') || '—'} />
        <KV label="Needs legal review" v={d.needsLegalReview ? 'Yes' : 'No'} />
      </ReviewBlock>
      <div className="text-sm text-slate-500">
        Submitting will create this as an <span className="font-medium text-slate-700">active</span> record.
      </div>
    </div>
  )
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-slate-200 rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <button type="button" onClick={onEdit} className="text-xs text-emerald-700 hover:text-emerald-800">
          Edit
        </button>
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
