import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createTransfer,
  updateTransfer,
  ValidationError,
  listActivities,
  type VendorInput,
} from '@/lib/api'
import type {
  VendorTransfer,
  DataLocation,
  TransferMechanismV2,
  DpaStatus,
  TiaStatus,
  Activity,
} from '@/lib/types'
import {
  DATA_LOCATIONS,
  DATA_LOCATION_LABELS,
  TRANSFER_MECHANISMS_V2,
  DPA_STATUSES,
  DPA_STATUS_LABELS,
  TIA_STATUSES,
  TIA_STATUS_LABELS,
  PERSONAL_DATA_CATEGORIES,
  DATA_SUBJECT_CATEGORIES,
} from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import FormSection from './FormSection'
import FormField from './FormField'
import ChipSelect from './ChipSelect'
import Toggle from './Toggle'

type Mode = 'create' | 'edit'

interface VendorQuickFormProps {
  mode: Mode
  initial?: VendorTransfer
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

function fromVendor(v: VendorTransfer): VendorInput {
  return {
    status: v.status,
    toolName: v.toolName,
    vendorName: v.vendorName || '',
    description: v.description || '',
    processesPersonalData: v.processesPersonalData,
    dataCategories: v.dataCategories || [],
    dataSubjects: v.dataSubjects || [],
    dataLocation: v.dataLocation,
    dataLocationDetail: v.dataLocationDetail || '',
    transferMechanism: v.transferMechanism,
    dpaStatus: v.dpaStatus,
    dpaSignedDate: v.dpaSignedDate || '',
    dpaUrl: v.dpaUrl || '',
    tiaStatus: v.tiaStatus,
    tiaNotes: v.tiaNotes || '',
    linkedActivityIds: v.linkedActivityIds || [],
    ownerName: v.ownerName || '',
    ownerEmail: v.ownerEmail,
    notes: v.notes || '',
    needsLegalReview: v.needsLegalReview,
  }
}

export default function VendorQuickForm({ mode, initial }: VendorQuickFormProps) {
  const navigate = useNavigate()
  const { me } = useAuth()
  const isReadOnly = me?.role === 'read'
  const [draft, setDraft] = useState<VendorInput>(() =>
    initial ? fromVendor(initial) : emptyDraft(),
  )
  const [recordId, setRecordId] = useState<string | null>(initial?.id ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)
  const dirtyRef = useRef(false)
  const lastSavedRef = useRef<string>(JSON.stringify(initial ? fromVendor(initial) : draft))
  const [activities, setActivities] = useState<Activity[]>([])

  // Load activities for link picker
  useEffect(() => {
    listActivities({ status: 'all' }).then((r) => setActivities(r.items)).catch(() => {})
  }, [])

  function update<K extends keyof VendorInput>(key: K, value: VendorInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!autoSavedAt) return
    const t = setInterval(() => setTick((x) => x + 1), 5000)
    return () => clearInterval(t)
  }, [autoSavedAt])

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!recordId) return
      if (!dirtyRef.current) return
      const snap = JSON.stringify(draft)
      if (snap === lastSavedRef.current) return
      try {
        await updateTransfer(recordId, { ...draft, status: 'draft' })
        lastSavedRef.current = snap
        dirtyRef.current = false
        setAutoSavedAt(new Date())
      } catch (err) {
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
      const payload: VendorInput = { ...draft, status: targetStatus }
      let result: VendorTransfer
      if (recordId) {
        result = await updateTransfer(recordId, payload)
      } else {
        result = await createTransfer(payload)
        setRecordId(result.id)
      }
      lastSavedRef.current = JSON.stringify(fromVendor(result))
      dirtyRef.current = false
      if (isReadOnly && mode === 'create') {
        navigate(`/transfer-submission-thanks/${encodeURIComponent(result.id)}`)
      } else {
        navigate(`/transfers/${encodeURIComponent(result.id)}`)
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
  const linkOpts = activities
    .filter((a) => a.status !== 'archived')
    .map((a) => ({ id: a.id, label: a.activityName }))

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
                <li key={k}><span className="font-medium">{k}:</span> {v}</li>
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

      <FormSection title="Tool basics" description="Name, vendor, owner.">
        <FormField label="Tool name" required error={errors.toolName}>
          <input
            type="text"
            value={draft.toolName || ''}
            onChange={(e) => update('toolName', e.target.value)}
            className={inputCls(!!errors.toolName)}
            placeholder="e.g. Zendesk"
          />
        </FormField>
        <FormField label="Vendor legal entity" hint="Contracting party, e.g. 'Zendesk Inc.'">
          <input
            type="text"
            value={draft.vendorName || ''}
            onChange={(e) => update('vendorName', e.target.value)}
            className={inputCls(false)}
          />
        </FormField>
        <FormField label="What does the tool do?">
          <textarea
            value={draft.description || ''}
            onChange={(e) => update('description', e.target.value)}
            className={inputCls(false) + ' min-h-[60px]'}
          />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Owner name">
            <input
              type="text"
              value={draft.ownerName || ''}
              onChange={(e) => update('ownerName', e.target.value)}
              className={inputCls(false)}
            />
          </FormField>
          <FormField label="Owner email" required error={errors.ownerEmail}>
            <input
              type="email"
              value={draft.ownerEmail || ''}
              onChange={(e) => update('ownerEmail', e.target.value)}
              className={inputCls(!!errors.ownerEmail)}
              placeholder="owner@example.com"
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Personal data">
        <Toggle
          checked={!!draft.processesPersonalData}
          onChange={(v) => update('processesPersonalData', v)}
          label="This tool processes personal data"
          description="Turn off if no personal data flows through it."
        />
        {draft.processesPersonalData && (
          <>
            <FormField label="Personal data categories">
              <ChipSelect
                options={PERSONAL_DATA_CATEGORIES}
                value={draft.dataCategories || []}
                onChange={(v) => update('dataCategories', v)}
              />
            </FormField>
            <FormField label="Data subjects">
              <ChipSelect
                options={DATA_SUBJECT_CATEGORIES}
                value={draft.dataSubjects || []}
                onChange={(v) => update('dataSubjects', v)}
              />
            </FormField>
          </>
        )}
      </FormSection>

      <FormSection title="Location & transfer mechanism">
        <FormField label="Where does the data sit?" required error={errors.dataLocation}>
          <select
            value={draft.dataLocation || 'Unknown'}
            onChange={(e) => update('dataLocation', e.target.value as DataLocation)}
            className={inputCls(!!errors.dataLocation)}
          >
            {DATA_LOCATIONS.map((d) => (
              <option key={d} value={d}>{DATA_LOCATION_LABELS[d]}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Location detail (optional)" hint="e.g. 'Ireland, accessible from US'">
          <input
            type="text"
            value={draft.dataLocationDetail || ''}
            onChange={(e) => update('dataLocationDetail', e.target.value)}
            className={inputCls(false)}
          />
        </FormField>
        <FormField label="Transfer mechanism" error={errors.transferMechanism}>
          <select
            value={draft.transferMechanism || ''}
            onChange={(e) => update('transferMechanism', (e.target.value || undefined) as TransferMechanismV2 | undefined)}
            className={inputCls(!!errors.transferMechanism)}
          >
            <option value="">Select…</option>
            {TRANSFER_MECHANISMS_V2.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FormField>
      </FormSection>

      <FormSection title="Data Processing Agreement (DPA)">
        <FormField label="DPA status">
          <select
            value={draft.dpaStatus || 'missing'}
            onChange={(e) => update('dpaStatus', e.target.value as DpaStatus)}
            className={inputCls(false)}
          >
            {DPA_STATUSES.map((s) => (
              <option key={s} value={s}>{DPA_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="DPA signed date" hint="ISO date, optional">
            <input
              type="date"
              value={(draft.dpaSignedDate || '').slice(0, 10)}
              onChange={(e) => update('dpaSignedDate', e.target.value || '')}
              className={inputCls(false)}
            />
          </FormField>
          <FormField label="DPA link / reference">
            <input
              type="text"
              value={draft.dpaUrl || ''}
              onChange={(e) => update('dpaUrl', e.target.value)}
              className={inputCls(false)}
              placeholder="URL or document reference"
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Transfer Impact Assessment (TIA)">
        <FormField label="TIA status">
          <select
            value={draft.tiaStatus || 'not_assessed'}
            onChange={(e) => update('tiaStatus', e.target.value as TiaStatus)}
            className={inputCls(false)}
          >
            {TIA_STATUSES.map((s) => (
              <option key={s} value={s}>{TIA_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </FormField>
        <FormField label="TIA notes">
          <textarea
            value={draft.tiaNotes || ''}
            onChange={(e) => update('tiaNotes', e.target.value)}
            className={inputCls(false) + ' min-h-[60px]'}
          />
        </FormField>
      </FormSection>

      <FormSection title="Other" defaultOpen={false}>
        <FormField label="Linked processing activities" hint="Tie this vendor to one or more activities in the main register.">
          <div className="space-y-1 max-h-64 overflow-y-auto border border-slate-200 rounded-md p-2 bg-white">
            {linkOpts.length === 0 && (
              <div className="text-xs text-slate-500 px-2 py-1">No activities to link.</div>
            )}
            {linkOpts.map((o) => {
              const checked = (draft.linkedActivityIds || []).includes(o.id)
              return (
                <label key={o.id} className="flex items-center gap-2 text-sm px-2 py-1 hover:bg-slate-50 rounded">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const cur = draft.linkedActivityIds || []
                      update(
                        'linkedActivityIds',
                        e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id),
                      )
                    }}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              )
            })}
          </div>
        </FormField>
        <Toggle
          checked={!!draft.needsLegalReview}
          onChange={(v) => update('needsLegalReview', v)}
          label="Needs legal review"
        />
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
            {autoSavedAt && <span>Auto-saved {secondsAgo(autoSavedAt, tick)}s ago</span>}
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

function secondsAgo(d: Date, _tick: number): number {
  void _tick
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
}
