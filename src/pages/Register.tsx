import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { listActivities, updateActivity } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import type { Activity } from '@/lib/types'
import { DEPARTMENTS, LAWFUL_BASIS_OPTIONS, isReviewOverdue, isIncomplete } from '@/lib/constants'
import { exportToExcel, exportToPdf, exportToCsv } from '@/lib/export'

type StatusTab = 'active' | 'archived' | 'all' | 'draft' | 'pending_review'
type TriFilter = '' | 'yes' | 'no'

interface ExtraFilters {
  overdueReview: TriFilter
  childrensData: TriFilter
  specialCategoryData: TriFilter
  internationalTransfers: TriFilter
  aiInvolvement: TriFilter
  needsLegalReview: TriFilter
  incomplete: TriFilter
}

function emptyExtras(): ExtraFilters {
  return {
    overdueReview: '',
    childrensData: '',
    specialCategoryData: '',
    internationalTransfers: '',
    aiInvolvement: '',
    needsLegalReview: '',
    incomplete: '',
  }
}

export default function Register() {
  const { me } = useAuth()
  const canEdit = me?.role === 'edit' || me?.role === 'admin'
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusTab, setStatusTab] = useState<StatusTab>('active')
  const [department, setDepartment] = useState<string>('')
  const [lawfulBasis, setLawfulBasis] = useState<string>('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [extras, setExtras] = useState<ExtraFilters>(emptyExtras)
  const [draftCount, setDraftCount] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listActivities({
      status: statusTab,
      department: department || undefined,
      lawfulBasis: lawfulBasis || undefined,
      q: debouncedQ || undefined,
      overdueReview: extras.overdueReview || undefined,
      childrensData: extras.childrensData || undefined,
      specialCategoryData: extras.specialCategoryData || undefined,
      internationalTransfers: extras.internationalTransfers || undefined,
      aiInvolvement: extras.aiInvolvement || undefined,
      needsLegalReview: extras.needsLegalReview || undefined,
    })
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load activities')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [statusTab, department, lawfulBasis, debouncedQ, extras])

  // Fetch draft + pending review counts for editors/admins
  useEffect(() => {
    if (!canEdit) {
      setDraftCount(null)
      setPendingCount(null)
      return
    }
    let cancelled = false
    listActivities({ status: 'draft' })
      .then((res) => {
        if (!cancelled) setDraftCount(res.count)
      })
      .catch(() => {
        if (!cancelled) setDraftCount(null)
      })
    listActivities({ status: 'pending_review' })
      .then((res) => {
        if (!cancelled) setPendingCount(res.count)
      })
      .catch(() => {
        if (!cancelled) setPendingCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [canEdit, statusTab])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Client-side filter for "Information missing" since server can't compute it
  const filteredItems = useMemo(() => {
    if (!extras.incomplete) return items
    const want = extras.incomplete === 'yes'
    return items.filter((it) => isIncomplete(it) === want)
  }, [items, extras.incomplete])

  const overdueCount = useMemo(
    () => items.filter((it) => isReviewOverdue(it.lastReviewedAt)).length,
    [items],
  )

  const activeExtraCount = useMemo(
    () => Object.values(extras).filter((v) => v !== '').length,
    [extras],
  )

  const runExport = async (fmt: 'excel' | 'pdf' | 'csv') => {
    setExportMenuOpen(false)
    setExporting(true)
    try {
      const org = me?.organisation || {}
      if (fmt === 'excel') await exportToExcel(items, org)
      else if (fmt === 'pdf') await exportToPdf(items, org)
      else await exportToCsv(items)
    } catch (err) {
      console.error(err)
      alert('Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Processing activities</h1>
          <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="font-medium text-slate-900">{filteredItems.length}</span> records
            </span>
            <span className="text-slate-300">·</span>
            <span className={overdueCount > 0 ? 'text-rose-600 font-medium' : 'text-slate-500'}>
              {overdueCount} overdue review{overdueCount === 1 ? '' : 's'}
            </span>
            {canEdit && draftCount !== null && (
              <>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => setStatusTab('draft')}
                  className={`underline-offset-2 hover:underline ${
                    statusTab === 'draft' ? 'text-emerald-700 font-medium' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Drafts ({draftCount})
                </button>
              </>
            )}
            {canEdit && pendingCount !== null && (
              <>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => setStatusTab('pending_review')}
                  className={`underline-offset-2 hover:underline ${
                    statusTab === 'pending_review'
                      ? 'text-amber-700 font-medium'
                      : pendingCount > 0
                      ? 'text-amber-700 hover:text-amber-800'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Pending review ({pendingCount})
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search activities, vendors, purposes…"
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 bg-white"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 16 16">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
          </svg>
        </div>

        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-700"
        >
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={lawfulBasis}
          onChange={(e) => setLawfulBasis(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-700"
        >
          <option value="">All bases</option>
          {LAWFUL_BASIS_OPTIONS.map((lb) => (
            <option key={lb} value={lb}>{lb}</option>
          ))}
        </select>

        <div className="inline-flex border border-slate-300 rounded-md overflow-hidden bg-white">
          {(['active', 'archived', 'all'] as StatusTab[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusTab(s)}
              className={`px-3 py-2 text-sm border-r border-slate-200 last:border-r-0 ${
                statusTab === s ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s === 'active' ? 'Active' : s === 'archived' ? 'Archived' : 'All'}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className={`px-3 py-2 border rounded-md text-sm ${
            filtersOpen || activeExtraCount > 0
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
              : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
          }`}
        >
          More filters{activeExtraCount > 0 ? ` (${activeExtraCount})` : ''}
        </button>

        <div className="relative" ref={exportRef}>
          <button
            type="button"
            onClick={() => setExportMenuOpen((o) => !o)}
            disabled={exporting || items.length === 0}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export ▾'}
          </button>
          {exportMenuOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-md z-10 w-40">
              <button onClick={() => runExport('excel')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">Excel (.xlsx)</button>
              <button onClick={() => runExport('pdf')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">PDF</button>
              <button onClick={() => runExport('csv')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">CSV</button>
            </div>
          )}
        </div>

        <Link
          to="/activities/new"
          className="px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
        >
          + New activity
        </Link>
      </div>

      {filtersOpen && (
        <div className="mb-5 bg-white border border-slate-200 rounded-md p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <TriFilterControl
              label="Overdue review"
              value={extras.overdueReview}
              onChange={(v) => setExtras({ ...extras, overdueReview: v })}
            />
            <TriFilterControl
              label="Children's data"
              value={extras.childrensData}
              onChange={(v) => setExtras({ ...extras, childrensData: v })}
            />
            <TriFilterControl
              label="Special category data"
              value={extras.specialCategoryData}
              onChange={(v) => setExtras({ ...extras, specialCategoryData: v })}
            />
            <TriFilterControl
              label="International transfers"
              value={extras.internationalTransfers}
              onChange={(v) => setExtras({ ...extras, internationalTransfers: v })}
            />
            <TriFilterControl
              label="AI involvement"
              value={extras.aiInvolvement}
              onChange={(v) => setExtras({ ...extras, aiInvolvement: v })}
            />
            <TriFilterControl
              label="Needs legal review"
              value={extras.needsLegalReview}
              onChange={(v) => setExtras({ ...extras, needsLegalReview: v })}
            />
            <TriFilterControl
              label="Information missing"
              value={extras.incomplete}
              onChange={(v) => setExtras({ ...extras, incomplete: v })}
            />
          </div>
          {activeExtraCount > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setExtras(emptyExtras())}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading && <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>}
        {error && !loading && (
          <div className="p-10 text-center text-rose-600 text-sm">{error}</div>
        )}
        {!loading && !error && filteredItems.length === 0 && (
          <div className="p-10 text-center text-slate-500 text-sm">
            No records match the current filters.
          </div>
        )}
        {!loading && !error && filteredItems.length > 0 && (
          <RegisterTable
            items={filteredItems}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            onSaved={(a) => setItems((cur) => cur.map((x) => (x.id === a.id ? a : x)))}
          />
        )}
      </div>
    </AppShell>
  )
}

function TriFilterControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: TriFilter
  onChange: (v: TriFilter) => void
}) {
  const opts: { v: TriFilter; label: string }[] = [
    { v: '', label: 'All' },
    { v: 'yes', label: 'Yes' },
    { v: 'no', label: 'No' },
  ]
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      <div className="inline-flex border border-slate-300 rounded-md overflow-hidden bg-white">
        {opts.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-3 py-1.5 text-sm border-r border-slate-200 last:border-r-0 ${
              value === o.v ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type SortKey = 'team' | 'activity' | 'data' | 'owner' | 'reviewed'
type SortDir = 'asc' | 'desc'

function sortItems(items: Activity[], key: SortKey, dir: SortDir): Activity[] {
  const out = items.slice()
  const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  out.sort((a, b) => {
    let av = '', bv = ''
    if (key === 'team') { av = a.department || ''; bv = b.department || '' }
    else if (key === 'activity') { av = a.activityName || ''; bv = b.activityName || '' }
    else if (key === 'data') { av = (a.personalDataCategories?.[0] || ''); bv = (b.personalDataCategories?.[0] || '') }
    else if (key === 'owner') { av = a.ownerName || a.ownerEmail || ''; bv = b.ownerName || b.ownerEmail || '' }
    else { av = a.lastReviewedAt || ''; bv = b.lastReviewedAt || '' }
    const r = cmp(av, bv)
    return dir === 'asc' ? r : -r
  })
  return out
}

function RegisterTable({
  items,
  expandedId,
  onToggle,
  onSaved,
}: {
  items: Activity[]
  expandedId: string | null
  onToggle: (id: string) => void
  onSaved: (a: Activity) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('reviewed')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const sorted = useMemo(() => sortItems(items, sortKey, sortDir), [items, sortKey, sortDir])

  function clickHeader(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-[10%]" />
          <col className="w-[38%]" />
          <col className="w-[26%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead className="bg-slate-50">
          <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
            <SortableTH label="Team" k="team" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} />
            <SortableTH label="Activity" k="activity" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} />
            <SortableTH label="Data categories" k="data" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} />
            <SortableTH label="Owner" k="owner" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} />
            <SortableTH label="Last checked" k="reviewed" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((it) => (
            <RegisterRow
              key={it.id}
              item={it}
              expanded={expandedId === it.id}
              onToggle={() => onToggle(it.id)}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SortableTH({
  label, k, sortKey, sortDir, onClick,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onClick: (k: SortKey) => void
}) {
  const active = sortKey === k
  return (
    <th className="px-4 py-3 font-semibold select-none">
      <button
        type="button"
        onClick={() => onClick(k)}
        className="inline-flex items-center gap-1 hover:text-slate-700"
      >
        {label}
        <span className={`text-[10px] ${active ? 'text-slate-500' : 'text-slate-300'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </button>
    </th>
  )
}

function RegisterRow({
  item,
  expanded,
  onToggle,
  onSaved,
}: {
  item: Activity
  expanded: boolean
  onToggle: () => void
  onSaved: (a: Activity) => void
}) {
  const { me } = useAuth()
  const canEdit = me?.role === 'edit' || me?.role === 'admin'
  const overdue = isReviewOverdue(item.lastReviewedAt)
  const dataCats = item.personalDataCategories ?? []
  const dataShown = dataCats.slice(0, 3).join(', ')
  const dataMore = dataCats.length > 3
    ? ` +${dataCats.length - 3} more`
    : ''
  const purpose = item.purposeShort || item.purposeFull

  const ownerLabel = item.ownerName?.trim() || prettifyEmail(item.ownerEmail) || 'Unassigned'

  return (
    <>
      <tr
        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-3 align-middle">
          <CategoryBadge department={item.department} />
        </td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-slate-900">{item.activityName}</span>
            {item.status !== 'active' && <StatusTag status={item.status} />}
          </div>
          {purpose && (
            <div className="text-sm text-slate-600 line-clamp-2 mt-0.5">
              {purpose}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {isIncomplete(item) && <Pill label="Information missing" tone="rose" />}
            {item.childrensData && <Pill label="Children" tone="amber" />}
            {item.specialCategoryData && <Pill label="Special category" tone="rose" />}
            {item.internationalTransfers && <Pill label="Transfer" tone="sky" />}
            {item.aiInvolvement && <Pill label="AI" tone="violet" />}
          </div>
        </td>
        <td className="px-4 py-3 text-slate-700 text-sm align-top">
          {dataShown || <span className="text-slate-400">—</span>}
          {dataMore && <span className="text-slate-400">{dataMore}</span>}
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <div className="text-slate-800 truncate" title={item.ownerEmail || undefined}>{ownerLabel}</div>
        </td>
        <td className={`px-4 py-3 align-top text-sm whitespace-nowrap ${overdue ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
          {overdue && <span className="mr-1" aria-hidden>⚠</span>}
          {item.lastReviewedAt?.slice(0, 10) || '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-t border-slate-100">
          <td colSpan={5} className="px-6 py-4 text-sm text-slate-700">
            <ExpandedEditor item={item} canEdit={canEdit} onSaved={onSaved} />
            <div className="mt-4 pt-3 border-t border-slate-200">
              <Link
                to={`/activities/${encodeURIComponent(item.id)}`}
                onClick={(e) => e.stopPropagation()}
                className="text-emerald-700 hover:text-emerald-800 text-sm font-medium"
              >
                View full record →
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ExpandedEditor({
  item,
  canEdit,
  onSaved,
}: {
  item: Activity
  canEdit: boolean
  onSaved: (a: Activity) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" onClick={(e) => e.stopPropagation()}>
      <InlineText
        label="Activity name"
        value={item.activityName}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { activityName: v }))}
      />
      <InlineText
        label="Owner name"
        value={item.ownerName || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { ownerName: v }))}
      />
      <InlineText
        label="Owner email"
        value={item.ownerEmail}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { ownerEmail: v }))}
      />
      <InlineSelect
        label="Team"
        value={item.department}
        options={DEPARTMENTS}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { department: v }))}
      />
      <InlineTextarea
        label="Full purpose"
        value={item.purposeFull || item.purposeShort || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { purposeFull: v }))}
      />
      <InlineSelect
        label="Lawful basis"
        value={item.lawfulBasis}
        options={LAWFUL_BASIS_OPTIONS}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { lawfulBasis: v as Activity['lawfulBasis'] }))}
      />
      <InlineText
        label="Data subjects"
        value={(item.dataSubjects ?? []).join(', ')}
        editable={canEdit}
        hint="Comma-separated"
        onSave={async (v) => onSaved(await updateActivity(item.id, { dataSubjects: splitCsv(v) }))}
      />
      <InlineText
        label="Personal data categories"
        value={(item.personalDataCategories ?? []).join(', ')}
        editable={canEdit}
        hint="Comma-separated"
        onSave={async (v) => onSaved(await updateActivity(item.id, { personalDataCategories: splitCsv(v) }))}
      />
      <InlineText
        label="Recipients"
        value={(item.recipients ?? []).join(', ')}
        editable={canEdit}
        hint="Comma-separated"
        onSave={async (v) => onSaved(await updateActivity(item.id, { recipients: splitCsv(v) }))}
      />
      <InlineText
        label="Retention period"
        value={item.retentionPeriod || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { retentionPeriod: v }))}
      />
      <ReadOnlyField
        label="International transfers"
        value={
          item.internationalTransfers
            ? `Yes${item.transferMechanism ? ` (${item.transferMechanism})` : ''}${
                item.transferCountries?.length ? ` — ${item.transferCountries.join(', ')}` : ''
              }`
            : 'No'
        }
      />
      <InlineText
        label="Security measures (TOMs)"
        value={(item.tomsChecklist ?? []).join(', ')}
        editable={canEdit}
        hint="Comma-separated"
        onSave={async (v) => onSaved(await updateActivity(item.id, { tomsChecklist: splitCsv(v) }))}
      />
      <InlineTextarea
        label="Additional / deviating security measures"
        value={item.tomsAdditional || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { tomsAdditional: v }))}
      />
      <InlineTextarea
        label="Notes"
        value={item.notes || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateActivity(item.id, { notes: v }))}
      />
    </div>
  )
}

function splitCsv(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

function InlineText({
  label, value, editable, onSave, hint,
}: { label: string; value: string; editable: boolean; onSave: (v: string) => Promise<void>; hint?: string }) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(value); setDirty(false) }, [value])

  async function save() {
    if (draft === value) { setDirty(false); return }
    setSaving(true); setErr(null)
    try { await onSave(draft); setDirty(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  if (!editable) {
    return <ReadOnlyField label={label} value={value} />
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value); setDirty(false) } }}
        onBlur={save}
        disabled={saving}
        placeholder="—"
        className={editableFieldCls(dirty)}
      />
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
      {err && <div className="text-xs text-rose-600 mt-1">{err}</div>}
    </div>
  )
}

function InlineTextarea({
  label, value, editable, onSave,
}: { label: string; value: string; editable: boolean; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(value); setDirty(false) }, [value])

  async function save() {
    if (draft === value) { setDirty(false); return }
    setSaving(true); setErr(null)
    try { await onSave(draft); setDirty(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  if (!editable) {
    return (
      <div className="md:col-span-2">
        <FieldLabel>{label}</FieldLabel>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap min-h-[40px]">
          {value || <span className="text-slate-400">—</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="md:col-span-2">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true) }}
        onBlur={save}
        disabled={saving}
        placeholder="—"
        rows={3}
        className={editableFieldCls(dirty, true)}
      />
      {err && <div className="text-xs text-rose-600 mt-1">{err}</div>}
    </div>
  )
}

function InlineSelect({
  label, value, options, editable, onSave,
}: { label: string; value: string; options: readonly string[]; editable: boolean; onSave: (v: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(v: string) {
    if (v === value) return
    setSaving(true); setErr(null)
    try { await onSave(v) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  if (!editable) {
    return <ReadOnlyField label={label} value={value} />
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value || ''}
        onChange={(e) => pick(e.target.value)}
        disabled={saving}
        className={editableFieldCls(false)}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {err && <div className="text-xs text-rose-600 mt-1">{err}</div>}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">{children}</div>
}

function editableFieldCls(dirty: boolean, textarea = false): string {
  return [
    'w-full px-3 py-2 border rounded-md text-sm bg-white text-slate-800',
    'focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-600',
    'disabled:opacity-50',
    'placeholder:text-slate-400',
    textarea ? 'min-h-[72px]' : '',
    dirty ? 'border-emerald-400' : 'border-slate-300 hover:border-slate-400',
  ].join(' ')
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 min-h-[40px]">
        {value || <span className="text-slate-400">—</span>}
      </div>
    </div>
  )
}


function prettifyEmail(email: string): string {
  if (!email) return ''
  const local = email.split('@')[0] || ''
  if (!local) return email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

type PillTone = 'amber' | 'rose' | 'sky' | 'violet' | 'slate' | 'emerald'

const pillStyles: Record<PillTone, string> = {
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

function Pill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${pillStyles[tone]}`}
    >
      {label}
    </span>
  )
}

const categoryStyles: Record<string, string> = {
  'Product': 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  'Engineering': 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  'Data Science & AI': 'bg-violet-100 text-violet-800 ring-violet-200',
  'Marketing': 'bg-rose-100 text-rose-800 ring-rose-200',
  'Customer Support': 'bg-sky-100 text-sky-800 ring-sky-200',
  'HR': 'bg-amber-100 text-amber-800 ring-amber-200',
  'Finance': 'bg-cyan-100 text-cyan-800 ring-cyan-200',
  'Legal': 'bg-slate-200 text-slate-800 ring-slate-300',
  'B2B / Partnerships': 'bg-orange-100 text-orange-800 ring-orange-200',
  'Operations': 'bg-teal-100 text-teal-800 ring-teal-200',
}

const DEPT_SHORT_LABELS: Record<string, string> = {
  'Customer Support': 'Support',
  'Data Science & AI': 'Data & AI',
  'B2B / Partnerships': 'B2B',
  'Engineering': 'Eng',
  'Operations': 'Ops',
  'Marketing': 'Marketing',
}

function CategoryBadge({ department }: { department?: string }) {
  const dep = department || 'Operations'
  const label = DEPT_SHORT_LABELS[dep] || dep
  const style = categoryStyles[dep] || 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <div
      className={`w-full text-center rounded-md py-1.5 px-1 text-[10px] font-bold uppercase ring-1 ring-inset ${style} truncate leading-tight`}
      title={dep}
    >
      {label}
    </div>
  )
}

function StatusTag({ status }: { status: Activity['status'] }) {
  const map = {
    draft: 'bg-slate-100 text-slate-600',
    pending_review: 'bg-amber-100 text-amber-800',
    archived: 'bg-slate-200 text-slate-600',
    active: 'bg-emerald-100 text-emerald-700',
  } as const
  const label = {
    draft: 'Draft',
    pending_review: 'Pending review',
    archived: 'Archived',
    active: 'Active',
  } as const
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${map[status]}`}>
      {label[status]}
    </span>
  )
}
