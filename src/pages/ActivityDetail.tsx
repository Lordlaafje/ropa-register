import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import {
  getActivity,
  archiveActivity,
  restoreActivity,
  flagReview,
  clearReview,
  approveActivity,
  sendBackActivity,
  nudgeOwner,
  revertActivity,
  listTransfers,
} from '@/lib/api'
import type { VendorTransfer } from '@/lib/types'
import { STATUS_LABELS } from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import type { Activity } from '@/lib/types'
import { isReviewOverdue } from '@/lib/constants'

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>()
  const { me } = useAuth()
  const canEdit = me?.role === 'edit' || me?.role === 'admin'
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [reviewDialog, setReviewDialog] = useState<null | 'approve' | 'sendback'>(null)
  const [reviewReason, setReviewReason] = useState('')
  const [vendorMap, setVendorMap] = useState<Map<string, VendorTransfer>>(new Map())

  useEffect(() => {
    let cancelled = false
    listTransfers({ status: 'all' })
      .then((r) => {
        if (cancelled) return
        const m = new Map<string, VendorTransfer>()
        for (const t of r.items) m.set((t.toolName || '').toLowerCase().trim(), t)
        setVendorMap(m)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getActivity(id)
      .then((a) => {
        if (!cancelled) setActivity(a)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load')
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

  const a = activity
  const overdue = isReviewOverdue(a.lastReviewedAt)

  return (
    <AppShell>
      <Link to="/" className="text-sm text-emerald-700 hover:text-emerald-800">← Back to register</Link>

      <div className="mt-4 flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{a.activityName}</h1>
            <StatusBadge status={a.status} />
            {a.childrensData && <Flag label="Children's data" tone="amber" />}
            {a.specialCategoryData && <Flag label="Special category" tone="rose" />}
            {a.internationalTransfers && <Flag label="International transfer" tone="sky" />}
            {a.aiInvolvement && <Flag label="AI" tone="violet" />}
            {a.needsLegalReview && <Flag label="Needs legal review" tone="emerald" />}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {a.department} · Owner: {a.ownerName ? `${a.ownerName}${a.ownerEmail ? ` (${a.ownerEmail})` : ''}` : a.ownerEmail || '—'} · Role: {a.controllerRole}
          </div>
        </div>
        {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {a.status === 'pending_review' && (
            <>
              <button
                type="button"
                disabled={!!actionBusy}
                onClick={() => {
                  setReviewDialog('approve')
                  setReviewReason('')
                  setActionError(null)
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={!!actionBusy}
                onClick={() => {
                  setReviewDialog('sendback')
                  setReviewReason('')
                  setActionError(null)
                }}
                className="px-3 py-1.5 text-sm font-medium border border-amber-300 rounded-md bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                Send back
              </button>
            </>
          )}
          <Link
            to={`/activities/${encodeURIComponent(a.id)}/edit`}
            className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
          >
            Edit
          </Link>
          {a.status !== 'archived' ? (
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={() => {
                setShowArchiveDialog(true)
                setArchiveReason('')
              }}
              className="px-3 py-1.5 text-sm font-medium border border-rose-300 rounded-md bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              Archive
            </button>
          ) : (
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={async () => {
                setActionBusy('restore')
                setActionError(null)
                try {
                  const updated = await restoreActivity(a.id)
                  setActivity(updated)
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'Restore failed')
                } finally {
                  setActionBusy(null)
                }
              }}
              className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {actionBusy === 'restore' ? 'Restoring…' : 'Restore'}
            </button>
          )}
          {!a.needsLegalReview ? (
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={async () => {
                setActionBusy('flag')
                setActionError(null)
                try {
                  const updated = await flagReview(a.id)
                  setActivity(updated)
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'Flag failed')
                } finally {
                  setActionBusy(null)
                }
              }}
              className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {actionBusy === 'flag' ? 'Flagging…' : 'Flag for legal review'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={async () => {
                setActionBusy('clear')
                setActionError(null)
                try {
                  const updated = await clearReview(a.id)
                  setActivity(updated)
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'Clear failed')
                } finally {
                  setActionBusy(null)
                }
              }}
              className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {actionBusy === 'clear' ? 'Clearing…' : 'Clear review flag'}
            </button>
          )}
          {canEdit && (a.status === 'draft' || a.needsLegalReview) && (
            <button
              type="button"
              disabled={!!actionBusy}
              title={!a.ownerEmail
                ? 'Assign a real owner first'
                : 'Send a Slack DM to the owner'}
              onClick={async () => {
                setActionBusy('nudge')
                setActionError(null)
                try {
                  const updated = await nudgeOwner(a.id)
                  setActivity(updated)
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'Nudge failed')
                } finally {
                  setActionBusy(null)
                }
              }}
              className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {actionBusy === 'nudge' ? 'Sending…' : 'Nudge owner (Slack)'}
            </button>
          )}
        </div>
        )}
      </div>

      {actionError && (
        <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3">
          {actionError}
        </div>
      )}

      {reviewDialog && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="text-base font-semibold text-slate-900">
              {reviewDialog === 'approve' && 'Approve this submission?'}
              {reviewDialog === 'sendback' && 'Send back to the submitter?'}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {reviewDialog === 'approve' && 'The record will become active in the register.'}
              {reviewDialog === 'sendback' && 'The record returns to draft so it can be edited and re-submitted. A reason is required.'}
            </p>
            <textarea
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder={reviewDialog === 'approve' ? 'Optional comment for the change log' : 'Why?'}
              className="w-full mt-3 px-3 py-2 border border-slate-300 rounded-md text-sm min-h-[80px] focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewDialog(null)}
                disabled={!!actionBusy}
                className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !!actionBusy ||
                  (reviewDialog === 'sendback' && !reviewReason.trim())
                }
                onClick={async () => {
                  if (!reviewDialog) return
                  setActionBusy(reviewDialog)
                  setActionError(null)
                  try {
                    let updated: Activity
                    if (reviewDialog === 'approve') {
                      updated = await approveActivity(a.id, reviewReason.trim() || undefined)
                    } else {
                      updated = await sendBackActivity(a.id, reviewReason.trim())
                    }
                    setActivity(updated)
                    setReviewDialog(null)
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : 'Action failed')
                  } finally {
                    setActionBusy(null)
                  }
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md text-white disabled:opacity-50 ${
                  reviewDialog === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {actionBusy === reviewDialog
                  ? 'Working…'
                  : reviewDialog === 'approve'
                  ? 'Approve'
                  : 'Send back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchiveDialog && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="text-base font-semibold text-slate-900">Archive this activity?</h3>
            <p className="text-sm text-slate-600 mt-1">
              The record stays in the register for audit, but is hidden from the default view. A reason is required.
            </p>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Why is this being archived?"
              className="w-full mt-3 px-3 py-2 border border-slate-300 rounded-md text-sm min-h-[80px] focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowArchiveDialog(false)}
                disabled={actionBusy === 'archive'}
                className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!archiveReason.trim() || actionBusy === 'archive'}
                onClick={async () => {
                  setActionBusy('archive')
                  setActionError(null)
                  try {
                    const updated = await archiveActivity(a.id, archiveReason.trim())
                    setActivity(updated)
                    setShowArchiveDialog(false)
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : 'Archive failed')
                  } finally {
                    setActionBusy(null)
                  }
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {actionBusy === 'archive' ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Section title="Processing overview">
        <KV label="Purpose">{a.purposeFull || a.purposeShort || '—'}</KV>
        <KV label="Controller/processor role">{a.controllerRole}</KV>
        <KV label="Systems / vendors">
          {a.systemsVendors && a.systemsVendors.length ? (
            <span>
              {a.systemsVendors.map((sv, idx) => {
                const match = vendorMap.get((sv || '').toLowerCase().trim())
                return (
                  <span key={idx}>
                    {idx > 0 && ', '}
                    {sv}
                    {match && (
                      <>
                        {' '}
                        <Link
                          to={`/transfers/${encodeURIComponent(match.id)}`}
                          className="text-xs text-emerald-700 hover:text-emerald-800"
                        >
                          (View transfer assessment →)
                        </Link>
                      </>
                    )}
                  </span>
                )
              })}
            </span>
          ) : '—'}
        </KV>
        <KV label="Recipients">{list(a.recipients)}</KV>
      </Section>

      <Section title="Data">
        <KV label="Data subjects">{list(a.dataSubjects)}</KV>
        <KV label="Personal data categories">{list(a.personalDataCategories)}</KV>
        <KV label="Lawful basis">{a.lawfulBasis}</KV>
        <KV label="Children's data">{yesNo(a.childrensData)}</KV>
        <KV label="Special category data">{yesNo(a.specialCategoryData)}</KV>
        <KV label="AI involvement">{yesNo(a.aiInvolvement)}</KV>
      </Section>

      <Section title="Retention & transfers">
        <KV label="Retention period">{a.retentionPeriod || '—'}</KV>
        {a.retentionNotes && <KV label="Retention notes">{a.retentionNotes}</KV>}
        <KV label="International transfers">{yesNo(a.internationalTransfers)}</KV>
        {a.internationalTransfers && (
          <>
            <KV label="Transfer mechanism">{a.transferMechanism || '—'}</KV>
            <KV label="Countries">{list(a.transferCountries || [])}</KV>
          </>
        )}
      </Section>

      <Section title="Security measures (TOMs)">
        <KV label="Checklist">{list(a.tomsChecklist)}</KV>
        {a.tomsAdditional && <KV label="Additional / deviations">{a.tomsAdditional}</KV>}
      </Section>

      <Section title="Review & DPIA">
        <KV label="DPIA status">{a.dpiaStatus.replace('_', ' ')}</KV>
        <KV label="Needs legal review">{yesNo(a.needsLegalReview)}</KV>
        <KV label="Last reviewed">
          <span className={overdue ? 'text-rose-600 font-medium' : ''}>
            {overdue && <span className="mr-1">⚠️</span>}
            {a.lastReviewedAt?.slice(0, 10) || '—'}
          </span>
        </KV>
        {a.nextReviewAt && <KV label="Next review">{a.nextReviewAt.slice(0, 10)}</KV>}
      </Section>

      {(a.references || a.notes) && (
        <Section title="References & notes">
          {a.references && <KV label="References">{a.references}</KV>}
          {a.notes && <KV label="Notes">{a.notes}</KV>}
        </Section>
      )}

      <Section title="Record metadata">
        <KV label="Created">{a.createdAt?.slice(0, 10)} by {a.createdByEmail}</KV>
        <KV label="Last updated">{a.lastUpdatedAt?.slice(0, 10)} by {a.lastUpdatedByEmail}</KV>
      </Section>

      <div className="mt-6 bg-white border border-slate-200 rounded-lg">
        <button
          type="button"
          onClick={() => setLogOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Change log ({a.changeLog?.length || 0})
          <span className="text-slate-400">{logOpen ? '▾' : '▸'}</span>
        </button>
        {logOpen && (
          <div className="border-t border-slate-200 divide-y divide-slate-100">
            {(!a.changeLog || a.changeLog.length === 0) && (
              <div className="px-5 py-4 text-sm text-slate-500">No change log entries.</div>
            )}
            {(a.changeLog || [])
              .slice()
              .sort((x, y) => (y.timestamp || '').localeCompare(x.timestamp || ''))
              .map((e, i) => (
                <div key={i} className="px-5 py-3 text-sm">
                  <div className="text-slate-500 text-xs">
                    {e.timestamp?.slice(0, 19).replace('T', ' ')} · {e.actorEmail}
                  </div>
                  <div className="text-slate-800">
                    <span className="font-medium">{e.eventType}</span>
                    {e.fieldName && <> · {e.fieldName}</>}
                    {e.oldValue && e.newValue && (
                      <> · <span className="text-slate-500">{e.oldValue}</span> → {e.newValue}</>
                    )}
                    {e.reason && <> · {e.reason}</>}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <VersionHistory activity={a} onReverted={(updated) => setActivity(updated)} />
    </AppShell>
  )
}

function VersionHistory({
  activity,
  onReverted,
}: {
  activity: Activity
  onReverted: (a: Activity) => void
}) {
  const { me } = useAuth()
  const canEdit = me?.role === 'edit' || me?.role === 'admin'
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const versions = activity.versions || []

  async function doRevert(i: number) {
    if (!confirm('Revert to this version? The current state will also be saved as a version, so you can undo this.')) return
    setBusy(i); setErr(null)
    try {
      const updated = await revertActivity(activity.id, i)
      onReverted(updated)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Revert failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Version history ({versions.length})
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 divide-y divide-slate-100">
          {versions.length === 0 && (
            <div className="px-5 py-4 text-sm text-slate-500">No prior versions yet. Edits will be snapshotted here.</div>
          )}
          {versions.slice().reverse().map((v, displayIdx) => {
            const realIdx = versions.length - 1 - displayIdx
            return (
              <div key={realIdx} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="text-slate-800">{v.savedAt?.slice(0, 19).replace('T', ' ')}</div>
                  <div className="text-xs text-slate-500">by {v.savedByEmail} · {v.label || 'snapshot'}</div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => doRevert(realIdx)}
                    className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy === realIdx ? 'Reverting…' : 'Revert to this'}
                  </button>
                )}
              </div>
            )
          })}
          {err && <div className="px-5 py-3 text-xs text-rose-600">{err}</div>}
          <div className="px-5 py-2 text-[11px] text-slate-400 bg-slate-50">
            The 20 most recent versions are kept. Reverting saves the current state as a new version, so a revert can itself be undone.
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  )
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500 font-medium mb-0.5">{label}</div>
      <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{children}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: Activity['status'] }) {
  const cls =
    status === 'active'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'archived'
      ? 'bg-slate-200 text-slate-600'
      : status === 'pending_review'
      ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
      : 'bg-amber-100 text-amber-800'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

type FlagTone = 'amber' | 'rose' | 'sky' | 'violet' | 'emerald' | 'slate'

const flagStyles: Record<FlagTone, string> = {
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function Flag({ label, tone }: { label: string; tone: FlagTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${flagStyles[tone]}`}>
      {label}
    </span>
  )
}

function list(v: string[]) {
  return v && v.length ? v.join(', ') : '—'
}
function yesNo(b: boolean) {
  return b ? 'Yes' : 'No'
}
