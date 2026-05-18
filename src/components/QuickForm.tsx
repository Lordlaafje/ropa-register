import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createActivity,
  updateActivity,
  ValidationError,
  type ActivityInput,
} from '@/lib/api'
import type { Activity, ControllerRole, LawfulBasis, TransferMechanism, DpiaStatus } from '@/lib/types'
import {
  DEPARTMENTS,
  LAWFUL_BASIS_OPTIONS,
  TRANSFER_MECHANISMS,
  DPIA_STATUSES,
  DATA_SUBJECT_CATEGORIES,
  PERSONAL_DATA_CATEGORIES,
  STANDARD_TOMS,
} from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import FormSection from './FormSection'
import FormField from './FormField'
import ChipSelect from './ChipSelect'
import Toggle from './Toggle'

type Mode = 'create' | 'edit'

interface QuickFormProps {
  mode: Mode
  initial?: Activity
  initialDraft?: ActivityInput
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
    transferMechanism: undefined,
    transferCountries: [],
    childrensData: false,
    specialCategoryData: false,
    aiInvolvement: false,
    tomsChecklist: [],
    tomsAdditional: '',
    needsLegalReview: false,
    dpiaStatus: 'not_assessed',
    references: '',
    notes: '',
  }
}

function fromActivity(a: Activity): ActivityInput {
  return {
    status: a.status,
    activityName: a.activityName,
    purposeShort: a.purposeShort,
    purposeFull: a.purposeFull,
    department: a.department,
    ownerName: a.ownerName || '',
    ownerEmail: a.ownerEmail,
    controllerRole: a.controllerRole,
    systemsVendors: a.systemsVendors,
    recipients: a.recipients,
    dataSubjects: a.dataSubjects,
    personalDataCategories: a.personalDataCategories,
    lawfulBasis: a.lawfulBasis,
    retentionPeriod: a.retentionPeriod,
    retentionNotes: a.retentionNotes || '',
    internationalTransfers: a.internationalTransfers,
    transferMechanism: a.transferMechanism,
    transferCountries: a.transferCountries || [],
    childrensData: a.childrensData,
    specialCategoryData: a.specialCategoryData,
    aiInvolvement: a.aiInvolvement,
    tomsChecklist: a.tomsChecklist,
    tomsAdditional: a.tomsAdditional || '',
    needsLegalReview: a.needsLegalReview,
    dpiaStatus: a.dpiaStatus,
    references: a.references || '',
    notes: a.notes || '',
  }
}

export default function QuickForm({ mode, initial, initialDraft }: QuickFormProps) {
  const navigate = useNavigate()
  const { me } = useAuth()
  const isReadOnly = me?.role === 'read'
  const tomsLibrary = (me?.tomsLibrary && me.tomsLibrary.length ? me.tomsLibrary : STANDARD_TOMS) as readonly string[]
  const [draft, setDraft] = useState<ActivityInput>(() => {
    if (initial) return fromActivity(initial)
    if (initialDraft) return { ...emptyDraft(), ...initialDraft }
    return emptyDraft()
  })
  const [recordId, setRecordId] = useState<string | null>(initial?.id ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null)
  const [autoSavedTick, setAutoSavedTick] = useState(0)
  const dirtyRef = useRef(false)
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(initial ? fromActivity(initial) : draft))

  function update<K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    dirtyRef.current = true
  }

  // Tick to keep "Saved Xs ago" fresh
  useEffect(() => {
    if (!autoSavedAt) return
    const t = setInterval(() => setAutoSavedTick((x) => x + 1), 5000)
    return () => clearInterval(t)
  }, [autoSavedAt])

  // Auto-save loop. Only fires once a record exists (id known) AND form is dirty.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!recordId) return
      if (!dirtyRef.current) return
      const snapshot = JSON.stringify(draft)
      if (snapshot === lastSavedSnapshotRef.current) return
      try {
        const patch: ActivityInput = { ...draft, status: 'draft' }
        await updateActivity(recordId, patch)
        lastSavedSnapshotRef.current = snapshot
        dirtyRef.current = false
        setAutoSavedAt(new Date())
      } catch (err) {
        // silent — surfaced on manual save
        console.warn('auto-save failed', err)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [recordId, draft])

  async function save(targetStatus: 'draft' | 'active' | 'pending_review') {
    setSaving(true)
    setSubmitError(null)
    setErrors({})
    try {
      const payload: ActivityInput = { ...draft, status: targetStatus }
      let result: Activity
      if (recordId) {
        result = await updateActivity(recordId, payload)
      } else {
        result = await createActivity(payload)
        setRecordId(result.id)
      }
      lastSavedSnapshotRef.current = JSON.stringify(fromActivity(result))
      dirtyRef.current = false
      if (isReadOnly && mode === 'create') {
        navigate(`/submission-thanks/${encodeURIComponent(result.id)}`)
      } else {
        navigate(`/activities/${encodeURIComponent(result.id)}`)
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.errors)
        setSubmitError('Please fix the highlighted fields below.')
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  const errorList = Object.entries(errors)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const target: 'draft' | 'active' | 'pending_review' = mode === 'edit'
          ? (draft.status === 'draft' ? 'draft' : draft.status === 'pending_review' ? 'pending_review' : 'active')
          : isReadOnly
          ? 'pending_review'
          : 'active'
        save(target)
      }}
      className="space-y-4 pb-24"
    >
      {isReadOnly && mode === 'create' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-md p-3">
          Your submission will be reviewed by the legal team before it goes live in the register.
        </div>
      )}

      {submitError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3">
          {submitError}
          {errorList.length > 0 && (
            <ul className="mt-2 list-disc list-inside space-y-0.5">
              {errorList.map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{k}:</span> {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <div className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-3 py-2">
          Edited fields will be logged in the change log.
        </div>
      )}

      <FormSection title="Basics" description="Name, purpose, ownership.">
        <FormField label="Activity name" required error={errors.activityName}>
          <input
            type="text"
            value={draft.activityName || ''}
            onChange={(e) => update('activityName', e.target.value)}
            className={inputCls(!!errors.activityName)}
            placeholder="e.g. Customer support ticket handling"
          />
        </FormField>
        <FormField label="Short purpose" required error={errors.purposeShort} hint="One line — what this processing is for.">
          <input
            type="text"
            value={draft.purposeShort || ''}
            onChange={(e) => update('purposeShort', e.target.value)}
            className={inputCls(!!errors.purposeShort)}
          />
        </FormField>
        <FormField label="Full purpose" hint="Optional longer description.">
          <textarea
            value={draft.purposeFull || ''}
            onChange={(e) => update('purposeFull', e.target.value)}
            className={inputCls(false) + ' min-h-[80px]'}
          />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Department" required error={errors.department}>
            <select
              value={draft.department || ''}
              onChange={(e) => update('department', e.target.value)}
              className={inputCls(!!errors.department)}
            >
              <option value="">Select…</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Owner name" error={errors.ownerName}>
            <input
              type="text"
              value={draft.ownerName || ''}
              onChange={(e) => update('ownerName', e.target.value)}
              className={inputCls(!!errors.ownerName)}
              placeholder="Full name"
            />
          </FormField>
        </div>
        <FormField label="Owner email" required error={errors.ownerEmail}>
          <input
            type="email"
            value={draft.ownerEmail || ''}
            onChange={(e) => update('ownerEmail', e.target.value)}
            className={inputCls(!!errors.ownerEmail)}
            placeholder="owner@example.com"
          />
        </FormField>
        <FormField label="Controller/processor role" required error={errors.controllerRole}>
          <div className="flex gap-2">
            {(['controller', 'processor'] as ControllerRole[]).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => update('controllerRole', r)}
                className={chipCls(draft.controllerRole === r)}
              >
                {r}
              </button>
            ))}
          </div>
        </FormField>
      </FormSection>

      <FormSection title="Data" description="Whose data and what categories.">
        <FormField label="Data subjects" required error={errors.dataSubjects}>
          <ChipSelect
            options={DATA_SUBJECT_CATEGORIES}
            value={draft.dataSubjects || []}
            onChange={(v) => update('dataSubjects', v)}
          />
        </FormField>
        <FormField label="Personal data categories" required error={errors.personalDataCategories}>
          <ChipSelect
            options={PERSONAL_DATA_CATEGORIES}
            value={draft.personalDataCategories || []}
            onChange={(v) => update('personalDataCategories', v)}
          />
        </FormField>
        <FormField label="Systems / vendors" hint="Tools or processors involved.">
          <ChipSelect
            options={[]}
            value={draft.systemsVendors || []}
            onChange={(v) => update('systemsVendors', v)}
            placeholder="Add a system or vendor…"
          />
        </FormField>
        <FormField label="Recipients" hint="Internal teams or external parties that receive the data.">
          <ChipSelect
            options={[]}
            value={draft.recipients || []}
            onChange={(v) => update('recipients', v)}
            placeholder="Add a recipient…"
          />
        </FormField>
      </FormSection>

      <FormSection title="Legal basis & retention">
        <FormField label="Lawful basis" required error={errors.lawfulBasis}>
          <select
            value={draft.lawfulBasis || ''}
            onChange={(e) => update('lawfulBasis', e.target.value as LawfulBasis)}
            className={inputCls(!!errors.lawfulBasis)}
          >
            {LAWFUL_BASIS_OPTIONS.map((lb) => (
              <option key={lb} value={lb}>{lb}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Retention period">
          <input
            type="text"
            value={draft.retentionPeriod || ''}
            onChange={(e) => update('retentionPeriod', e.target.value)}
            className={inputCls(false)}
            placeholder="e.g. 7 years after contract end"
          />
        </FormField>
        <FormField label="Retention notes">
          <textarea
            value={draft.retentionNotes || ''}
            onChange={(e) => update('retentionNotes', e.target.value)}
            className={inputCls(false) + ' min-h-[60px]'}
          />
        </FormField>
      </FormSection>

      <FormSection title="Transfers & flags">
        <Toggle
          checked={!!draft.internationalTransfers}
          onChange={(v) => update('internationalTransfers', v)}
          label="International transfers"
          description="Data is sent outside the EU/EEA."
        />
        {draft.internationalTransfers && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-12">
            <FormField label="Transfer mechanism" error={errors.transferMechanism}>
              <select
                value={draft.transferMechanism || ''}
                onChange={(e) => update('transferMechanism', (e.target.value || undefined) as TransferMechanism | undefined)}
                className={inputCls(!!errors.transferMechanism)}
              >
                <option value="">Select…</option>
                {TRANSFER_MECHANISMS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Transfer countries">
              <ChipSelect
                options={[]}
                value={draft.transferCountries || []}
                onChange={(v) => update('transferCountries', v)}
                placeholder="e.g. US, UK"
              />
            </FormField>
          </div>
        )}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <Toggle
            checked={!!draft.childrensData}
            onChange={(v) => update('childrensData', v)}
            label="Children's data (Art. 8)"
          />
          <Toggle
            checked={!!draft.specialCategoryData}
            onChange={(v) => update('specialCategoryData', v)}
            label="Special category data (Art. 9)"
          />
          <Toggle
            checked={!!draft.aiInvolvement}
            onChange={(v) => update('aiInvolvement', v)}
            label="AI involvement"
          />
          <Toggle
            checked={!!draft.needsLegalReview}
            onChange={(v) => update('needsLegalReview', v)}
            label="Needs legal review"
          />
        </div>
      </FormSection>

      <FormSection title="Security (TOMs)">
        <FormField label="Standard measures">
          <ChipSelect
            options={tomsLibrary}
            value={draft.tomsChecklist || []}
            onChange={(v) => update('tomsChecklist', v)}
          />
        </FormField>
        <FormField label="Additional / deviating measures">
          <textarea
            value={draft.tomsAdditional || ''}
            onChange={(e) => update('tomsAdditional', e.target.value)}
            className={inputCls(false) + ' min-h-[60px]'}
          />
        </FormField>
      </FormSection>

      <FormSection title="Other" defaultOpen={false}>
        <FormField label="DPIA status">
          <select
            value={draft.dpiaStatus || 'not_assessed'}
            onChange={(e) => update('dpiaStatus', e.target.value as DpiaStatus)}
            className={inputCls(false)}
          >
            {DPIA_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </FormField>
        <FormField label="References" hint="Optional URLs to DPIA, DPA, etc. (free text).">
          <textarea
            value={draft.references || ''}
            onChange={(e) => update('references', e.target.value)}
            className={inputCls(false) + ' min-h-[60px]'}
          />
        </FormField>
        <FormField label="Notes">
          <textarea
            value={draft.notes || ''}
            onChange={(e) => update('notes', e.target.value)}
            className={inputCls(false) + ' min-h-[60px]'}
          />
        </FormField>
      </FormSection>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {autoSavedAt && (
              <span>
                Auto-saved {secondsAgo(autoSavedAt, autoSavedTick)}s ago
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode === 'create' && (
              <>
                {!isReadOnly && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => save('draft')}
                    className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save as draft'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : isReadOnly ? 'Submit for review' : 'Submit'}
                </button>
              </>
            )}
            {mode === 'edit' && (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}

function inputCls(hasError: boolean): string {
  const base = 'w-full px-3 py-2 border rounded-md text-sm bg-white text-slate-900 focus:outline-none focus:ring-2'
  return hasError
    ? `${base} border-rose-400 focus:border-rose-500 focus:ring-rose-100`
    : `${base} border-slate-300 focus:border-emerald-600 focus:ring-emerald-100`
}

function chipCls(active: boolean): string {
  return `px-3 py-1.5 rounded-md text-xs font-medium ring-1 ring-inset ${
    active ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
  }`
}

function secondsAgo(d: Date, _tick: number): number {
  void _tick
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
}
