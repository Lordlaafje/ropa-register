import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { listTransfers, updateTransfer } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import type { VendorTransfer, DataLocation, TransferMechanismV2, DpaStatus } from '@/lib/types'
import {
  DATA_LOCATIONS,
  DATA_LOCATION_LABELS,
  TRANSFER_MECHANISMS_V2,
  DPA_STATUSES,
  DPA_STATUS_LABELS,
  TIA_STATUSES,
  TIA_STATUS_LABELS,
  isReviewOverdue,
} from '@/lib/constants'
import { exportTransfersToExcel, exportTransfersToCsv } from '@/lib/export'

type StatusTab = 'active' | 'archived' | 'all' | 'draft' | 'pending_review'

export default function Transfers() {
  const { me } = useAuth()
  const canEdit = me?.role === 'edit' || me?.role === 'admin'
  const [items, setItems] = useState<VendorTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusTab, setStatusTab] = useState<StatusTab>('active')
  const [dataLocation, setDataLocation] = useState<string>('')
  const [mechanism, setMechanism] = useState<string>('')
  const [dpa, setDpa] = useState<string>('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [needsReviewOnly, setNeedsReviewOnly] = useState<'' | 'yes' | 'no'>('')
  const [draftCount, setDraftCount] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listTransfers({
      status: statusTab,
      dataLocation: dataLocation || undefined,
      transferMechanism: mechanism || undefined,
      dpaStatus: dpa || undefined,
      q: debouncedQ || undefined,
      needsLegalReview: needsReviewOnly || undefined,
    })
      .then((res) => { if (!cancelled) setItems(res.items) })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load transfers') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [statusTab, dataLocation, mechanism, dpa, debouncedQ, needsReviewOnly])

  useEffect(() => {
    if (!canEdit) { setDraftCount(null); setPendingCount(null); return }
    let cancelled = false
    listTransfers({ status: 'draft' }).then((r) => { if (!cancelled) setDraftCount(r.count) }).catch(() => {})
    listTransfers({ status: 'pending_review' }).then((r) => { if (!cancelled) setPendingCount(r.count) }).catch(() => {})
    return () => { cancelled = true }
  }, [canEdit, statusTab])

  const overdueCount = useMemo(
    () => items.filter((it) => isReviewOverdue(it.lastReviewedAt)).length,
    [items],
  )

  const activeExtras = needsReviewOnly !== '' ? 1 : 0

  async function runExport(fmt: 'excel' | 'csv') {
    setExporting(true)
    try {
      if (fmt === 'excel') await exportTransfersToExcel(items, me?.organisation || {})
      else await exportTransfersToCsv(items)
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
          <h1 className="text-2xl font-bold text-slate-900">Data transfers</h1>
          <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span><span className="font-medium text-slate-900">{items.length}</span> vendors</span>
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
            placeholder="Search tools, vendors, locations…"
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 bg-white"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 16 16">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
          </svg>
        </div>

        <select
          value={dataLocation}
          onChange={(e) => setDataLocation(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-700"
        >
          <option value="">All locations</option>
          {DATA_LOCATIONS.map((d) => (
            <option key={d} value={d}>{DATA_LOCATION_LABELS[d]}</option>
          ))}
        </select>

        <select
          value={mechanism}
          onChange={(e) => setMechanism(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-700"
        >
          <option value="">All mechanisms</option>
          {TRANSFER_MECHANISMS_V2.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={dpa}
          onChange={(e) => setDpa(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-700"
        >
          <option value="">All DPA statuses</option>
          {DPA_STATUSES.map((s) => (
            <option key={s} value={s}>DPA: {DPA_STATUS_LABELS[s]}</option>
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
            filtersOpen || activeExtras > 0
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
              : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
          }`}
        >
          More filters{activeExtras > 0 ? ` (${activeExtras})` : ''}
        </button>

        <button
          type="button"
          onClick={() => runExport('excel')}
          disabled={exporting || items.length === 0}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
        <button
          type="button"
          onClick={() => runExport('csv')}
          disabled={exporting || items.length === 0}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          CSV
        </button>

        <Link
          to="/transfers/new"
          className="px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
        >
          + New transfer
        </Link>
      </div>

      {filtersOpen && (
        <div className="mb-5 bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs font-medium text-slate-600 mb-1">Needs legal review</div>
          <div className="inline-flex border border-slate-300 rounded-md overflow-hidden bg-white">
            {[
              { v: '', label: 'All' },
              { v: 'yes', label: 'Yes' },
              { v: 'no', label: 'No' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setNeedsReviewOnly(o.v as '' | 'yes' | 'no')}
                className={`px-3 py-1.5 text-sm border-r border-slate-200 last:border-r-0 ${
                  needsReviewOnly === o.v ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading && <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>}
        {error && !loading && <div className="p-10 text-center text-rose-600 text-sm">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="p-10 text-center text-slate-500 text-sm">No transfers match the current filters.</div>
        )}
        {!loading && !error && items.length > 0 && (
          <TransfersTable
            items={items}
            onSaved={(t) => setItems((cur) => cur.map((x) => (x.id === t.id ? t : x)))}
          />
        )}
      </div>
    </AppShell>
  )
}

type TSortKey = 'tool' | 'pii' | 'location' | 'mechanism' | 'dpa' | 'tia' | 'reviewed'
type TSortDir = 'asc' | 'desc'

function sortTransfers(items: VendorTransfer[], key: TSortKey, dir: TSortDir): VendorTransfer[] {
  const out = items.slice()
  const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  out.sort((a, b) => {
    let av = '', bv = ''
    if (key === 'tool') { av = a.toolName || ''; bv = b.toolName || '' }
    else if (key === 'pii') { av = a.processesPersonalData ? '1' : '0'; bv = b.processesPersonalData ? '1' : '0' }
    else if (key === 'location') { av = a.dataLocation || ''; bv = b.dataLocation || '' }
    else if (key === 'mechanism') { av = a.transferMechanism || ''; bv = b.transferMechanism || '' }
    else if (key === 'dpa') { av = a.dpaStatus || ''; bv = b.dpaStatus || '' }
    else if (key === 'tia') { av = a.tiaStatus || ''; bv = b.tiaStatus || '' }
    else { av = a.lastReviewedAt || ''; bv = b.lastReviewedAt || '' }
    const r = cmp(av, bv)
    return dir === 'asc' ? r : -r
  })
  return out
}

function TransfersTable({
  items,
  onSaved,
}: {
  items: VendorTransfer[]
  onSaved: (t: VendorTransfer) => void
}) {
  const [sortKey, setSortKey] = useState<TSortKey>('reviewed')
  const [sortDir, setSortDir] = useState<TSortDir>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const sorted = useMemo(() => sortTransfers(items, sortKey, sortDir), [items, sortKey, sortDir])

  function click(k: TSortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
            <TSortableTH label="Tool" k="tool" sortKey={sortKey} sortDir={sortDir} onClick={click} />
            <TSortableTH label="PII" k="pii" sortKey={sortKey} sortDir={sortDir} onClick={click} />
            <TSortableTH label="Location" k="location" sortKey={sortKey} sortDir={sortDir} onClick={click} />
            <TSortableTH label="Mechanism" k="mechanism" sortKey={sortKey} sortDir={sortDir} onClick={click} />
            <TSortableTH label="DPA" k="dpa" sortKey={sortKey} sortDir={sortDir} onClick={click} />
            <TSortableTH label="TIA" k="tia" sortKey={sortKey} sortDir={sortDir} onClick={click} />
            <TSortableTH label="Last reviewed" k="reviewed" sortKey={sortKey} sortDir={sortDir} onClick={click} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((it) => (
            <TransferRow
              key={it.id}
              item={it}
              expanded={expandedId === it.id}
              onToggle={() => setExpandedId((cur) => (cur === it.id ? null : it.id))}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TSortableTH({
  label, k, sortKey, sortDir, onClick,
}: { label: string; k: TSortKey; sortKey: TSortKey; sortDir: TSortDir; onClick: (k: TSortKey) => void }) {
  const active = sortKey === k
  return (
    <th className="px-4 py-3 font-semibold select-none">
      <button type="button" onClick={() => onClick(k)} className="inline-flex items-center gap-1 hover:text-slate-700">
        {label}
        <span className={`text-[10px] ${active ? 'text-slate-500' : 'text-slate-300'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </button>
    </th>
  )
}

function TransferRow({
  item,
  expanded,
  onToggle,
  onSaved,
}: {
  item: VendorTransfer
  expanded: boolean
  onToggle: () => void
  onSaved: (t: VendorTransfer) => void
}) {
  const { me } = useAuth()
  const canEdit = me?.role === 'edit' || me?.role === 'admin'
  const overdue = isReviewOverdue(item.lastReviewedAt)
  return (
    <>
      <tr
        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3 align-top">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-slate-900">{item.toolName}</span>
            {item.status !== 'active' && <VendorStatusTag status={item.status} />}
          </div>
          {item.vendorName && (
            <div className="text-xs text-slate-500 mt-0.5">{item.vendorName}</div>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          {item.processesPersonalData ? <Pill label="Yes" tone="sky" /> : <Pill label="No" tone="slate" />}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="text-slate-800">{DATA_LOCATION_LABELS[item.dataLocation as DataLocation] || item.dataLocation || '—'}</div>
          {item.dataLocationDetail && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.dataLocationDetail}</div>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          {item.transferMechanism ? (
            <Pill label={shortMechanism(item.transferMechanism)} tone="violet" />
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <DpaPill status={item.dpaStatus} />
        </td>
        <td className="px-4 py-3 align-top">
          <Pill label={TIA_STATUS_LABELS[item.tiaStatus] || item.tiaStatus || '—'} tone="slate" />
        </td>
        <td className={`px-4 py-3 align-top text-sm whitespace-nowrap ${overdue ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
          {overdue && <span className="mr-1" aria-hidden>⚠</span>}
          {item.lastReviewedAt?.slice(0, 10) || '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-t border-slate-100">
          <td colSpan={7} className="px-6 py-4 text-sm text-slate-700">
            <TransferExpanded item={item} canEdit={canEdit} onSaved={onSaved} />
            <div className="mt-4 pt-3 border-t border-slate-200">
              <Link
                to={`/transfers/${encodeURIComponent(item.id)}`}
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

function TransferExpanded({
  item,
  canEdit,
  onSaved,
}: {
  item: VendorTransfer
  canEdit: boolean
  onSaved: (t: VendorTransfer) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" onClick={(e) => e.stopPropagation()}>
      <TInlineText
        label="Tool name"
        value={item.toolName}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { toolName: v }))}
      />
      <TInlineText
        label="Vendor / legal entity"
        value={item.vendorName || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { vendorName: v }))}
      />
      <TInlineTextarea
        label="Description"
        value={item.description || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { description: v }))}
      />
      <TInlineSelect
        label="Data location"
        value={item.dataLocation || ''}
        options={DATA_LOCATIONS}
        getLabel={(o) => DATA_LOCATION_LABELS[o as DataLocation] || o}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { dataLocation: v as DataLocation }))}
      />
      <TInlineText
        label="Location detail"
        value={item.dataLocationDetail || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { dataLocationDetail: v }))}
      />
      <TInlineSelect
        label="Transfer mechanism"
        value={item.transferMechanism || ''}
        options={TRANSFER_MECHANISMS_V2}
        editable={canEdit}
        onSave={async (v) =>
          onSaved(await updateTransfer(item.id, { transferMechanism: (v || undefined) as TransferMechanismV2 | undefined }))
        }
      />
      <TInlineSelect
        label="DPA status"
        value={item.dpaStatus || ''}
        options={DPA_STATUSES}
        getLabel={(o) => DPA_STATUS_LABELS[o as DpaStatus] || o}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { dpaStatus: v as DpaStatus }))}
      />
      <TInlineText
        label="DPA URL"
        value={item.dpaUrl || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { dpaUrl: v }))}
      />
      <TInlineSelect
        label="TIA status"
        value={item.tiaStatus || ''}
        options={TIA_STATUSES}
        getLabel={(o) => TIA_STATUS_LABELS[o as keyof typeof TIA_STATUS_LABELS] || o}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { tiaStatus: v as VendorTransfer['tiaStatus'] }))}
      />
      <TInlineTextarea
        label="TIA notes"
        value={item.tiaNotes || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { tiaNotes: v }))}
      />
      <TInlineText
        label="Owner name"
        value={item.ownerName || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { ownerName: v }))}
      />
      <TInlineText
        label="Owner email"
        value={item.ownerEmail}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { ownerEmail: v }))}
      />
      <TInlineTextarea
        label="Notes"
        value={item.notes || ''}
        editable={canEdit}
        onSave={async (v) => onSaved(await updateTransfer(item.id, { notes: v }))}
      />
    </div>
  )
}

function TFieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">{children}</div>
}

function tFieldCls(dirty: boolean, textarea = false): string {
  return [
    'w-full px-3 py-2 border rounded-md text-sm bg-white text-slate-800',
    'focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-600',
    'disabled:opacity-50',
    'placeholder:text-slate-400',
    textarea ? 'min-h-[72px]' : '',
    dirty ? 'border-emerald-400' : 'border-slate-300 hover:border-slate-400',
  ].join(' ')
}

function TReadOnly({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={span2 ? 'md:col-span-2' : undefined}>
      <TFieldLabel>{label}</TFieldLabel>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 min-h-[40px] whitespace-pre-wrap">
        {value || <span className="text-slate-400">—</span>}
      </div>
    </div>
  )
}

function TInlineText({
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
  if (!editable) return <TReadOnly label={label} value={value} />
  return (
    <div>
      <TFieldLabel>{label}</TFieldLabel>
      <input
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value); setDirty(false) } }}
        onBlur={save}
        disabled={saving}
        placeholder="—"
        className={tFieldCls(dirty)}
      />
      {err && <div className="text-xs text-rose-600 mt-1">{err}</div>}
    </div>
  )
}

function TInlineTextarea({
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
  if (!editable) return <TReadOnly label={label} value={value} span2 />
  return (
    <div className="md:col-span-2">
      <TFieldLabel>{label}</TFieldLabel>
      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true) }}
        onBlur={save}
        disabled={saving}
        placeholder="—"
        rows={3}
        className={tFieldCls(dirty, true)}
      />
      {err && <div className="text-xs text-rose-600 mt-1">{err}</div>}
    </div>
  )
}

function TInlineSelect({
  label, value, options, getLabel, editable, onSave,
}: {
  label: string
  value: string
  options: readonly string[]
  getLabel?: (o: string) => string
  editable: boolean
  onSave: (v: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function pick(v: string) {
    if (v === value) return
    setSaving(true); setErr(null)
    try { await onSave(v) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }
  if (!editable) return <TReadOnly label={label} value={getLabel ? getLabel(value) : value} />
  return (
    <div>
      <TFieldLabel>{label}</TFieldLabel>
      <select
        value={value || ''}
        onChange={(e) => pick(e.target.value)}
        disabled={saving}
        className={tFieldCls(false)}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{getLabel ? getLabel(o) : o}</option>)}
      </select>
      {err && <div className="text-xs text-rose-600 mt-1">{err}</div>}
    </div>
  )
}

function shortMechanism(m: TransferMechanismV2): string {
  if (m === 'DPF (EU-US Data Privacy Framework)') return 'DPF'
  if (m === 'BCR (Binding Corporate Rules)') return 'BCR'
  if (m === 'N/A — data stays in EU/EEA') return 'EU only'
  return m
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${pillStyles[tone]}`}>
      {label}
    </span>
  )
}

function DpaPill({ status }: { status: DpaStatus }) {
  const tone: PillTone =
    status === 'signed' ? 'emerald' :
    status === 'pending' ? 'amber' :
    status === 'not_required' ? 'slate' :
    'rose'
  return <Pill label={DPA_STATUS_LABELS[status] || status} tone={tone} />
}

function VendorStatusTag({ status }: { status: VendorTransfer['status'] }) {
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
