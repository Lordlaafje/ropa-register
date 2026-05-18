import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { getAdminConfig, updateAdminConfig } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import type { AppConfig, OrganisationDetails } from '@/lib/types'

const ORG_FIELDS: { key: keyof OrganisationDetails; label: string; placeholder?: string }[] = [
  { key: 'companyName', label: 'Company name', placeholder: 'Acme B.V.' },
  { key: 'chamberOfCommerce', label: 'Chamber of Commerce (KvK)' },
  { key: 'address', label: 'Address' },
  { key: 'contactName', label: 'Primary contact name' },
  { key: 'contactEmail', label: 'Primary contact email' },
  { key: 'contactPhone', label: 'Primary contact phone' },
  { key: 'dpoName', label: 'DPO name' },
  { key: 'dpoEmail', label: 'DPO email' },
  { key: 'tomsReferenceUrl', label: 'TOMs reference URL' },
  { key: 'tomsReferenceVersion', label: 'TOMs reference version' },
]

export default function Admin() {
  const { me, refreshMe } = useAuth()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAdminConfig()
      .then((c) => {
        if (!cancelled) setConfig(c)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load config')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <AppShell>
        <div className="text-slate-500 text-sm">Loading…</div>
      </AppShell>
    )
  }

  if (error || !config) {
    return (
      <AppShell>
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3">
          {error || 'Failed to load admin config.'}
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage who can edit, organisation details that appear in exports, and the TOMs library used in records.
        </p>
      </div>

      <AccessControlSection
        config={config}
        currentEmail={(me?.email || '').toLowerCase()}
        onSaved={async (next) => {
          setConfig(next)
          await refreshMe()
        }}
      />

      <OrganisationSection
        config={config}
        onSaved={async (next) => {
          setConfig(next)
          await refreshMe()
        }}
      />

      <TomsLibrarySection
        config={config}
        onSaved={async (next) => {
          setConfig(next)
          await refreshMe()
        }}
      />
    </AppShell>
  )
}

function AccessControlSection({
  config,
  currentEmail,
  onSaved,
}: {
  config: AppConfig
  currentEmail: string
  onSaved: (next: AppConfig) => Promise<void>
}) {
  const [editors, setEditors] = useState<string[]>(config.editAllowlist || [])
  const [admins, setAdmins] = useState<string[]>(config.adminAllowlist || [])
  const [editorInput, setEditorInput] = useState('')
  const [adminInput, setAdminInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [confirmRemoveSelf, setConfirmRemoveSelf] = useState(false)
  const [pendingNext, setPendingNext] = useState<{ editors: string[]; admins: string[] } | null>(null)

  useEffect(() => {
    setEditors(config.editAllowlist || [])
    setAdmins(config.adminAllowlist || [])
  }, [config])

  const dirty =
    JSON.stringify(editors) !== JSON.stringify(config.editAllowlist || []) ||
    JSON.stringify(admins) !== JSON.stringify(config.adminAllowlist || [])

  function add(list: string[], setList: (v: string[]) => void, raw: string, clear: () => void) {
    const e = raw.trim().toLowerCase()
    if (!e) return
    if (!isEmail(e)) {
      setError('Please enter a valid email address.')
      return
    }
    if (list.includes(e)) {
      setError(`${e} is already in the list.`)
      return
    }
    setError(null)
    setList([...list, e])
    clear()
  }

  function remove(list: string[], setList: (v: string[]) => void, e: string) {
    setList(list.filter((x) => x !== e))
  }

  async function performSave(nextEditors: string[], nextAdmins: string[]) {
    setSaving(true)
    setError(null)
    try {
      const next = await updateAdminConfig({
        editAllowlist: nextEditors,
        adminAllowlist: nextAdmins,
      })
      await onSaved(next)
      setSavedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    setError(null)
    const wasAdmin = (config.adminAllowlist || []).includes(currentEmail)
    const willBeAdmin = admins.includes(currentEmail)
    if (wasAdmin && !willBeAdmin) {
      setPendingNext({ editors, admins })
      setConfirmRemoveSelf(true)
      return
    }
    await performSave(editors, admins)
  }

  return (
    <Section
      title="Access control"
      dirty={dirty}
      saving={saving}
      onSave={save}
      savedAt={savedAt}
      error={error}
    >
      <p className="text-sm text-slate-600 mb-4">
        Editors can create and edit records. Admins also manage settings. Anyone signing in with an email on
        your allowed domain has read access automatically.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ListEditor
          title="Editors"
          emails={editors}
          currentEmail={currentEmail}
          input={editorInput}
          setInput={setEditorInput}
          onAdd={() => add(editors, setEditors, editorInput, () => setEditorInput(''))}
          onRemove={(e) => remove(editors, setEditors, e)}
        />
        <ListEditor
          title="Admins"
          emails={admins}
          currentEmail={currentEmail}
          input={adminInput}
          setInput={setAdminInput}
          onAdd={() => add(admins, setAdmins, adminInput, () => setAdminInput(''))}
          onRemove={(e) => remove(admins, setAdmins, e)}
        />
      </div>

      {confirmRemoveSelf && pendingNext && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="text-base font-semibold text-slate-900">Remove yourself as admin?</h3>
            <p className="text-sm text-slate-600 mt-1">
              You'll lose access to this admin page. Are you sure?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmRemoveSelf(false)
                  setPendingNext(null)
                }}
                className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const next = pendingNext
                  setConfirmRemoveSelf(false)
                  setPendingNext(null)
                  if (next) await performSave(next.editors, next.admins)
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-rose-600 text-white hover:bg-rose-700"
              >
                Remove me
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

function ListEditor({
  title,
  emails,
  currentEmail,
  input,
  setInput,
  onAdd,
  onRemove,
}: {
  title: string
  emails: string[]
  currentEmail: string
  input: string
  setInput: (v: string) => void
  onAdd: () => void
  onRemove: (e: string) => void
}) {
  return (
    <div className="border border-slate-200 rounded-md">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {title}
      </div>
      <ul className="divide-y divide-slate-100">
        {emails.length === 0 && (
          <li className="px-3 py-3 text-sm text-slate-400">No entries.</li>
        )}
        {emails.map((e) => {
          const isMe = e === currentEmail
          return (
            <li key={e} className="px-3 py-2 flex items-center justify-between text-sm">
              <span
                className={isMe ? 'text-rose-700 font-medium' : 'text-slate-800'}
                title={isMe ? "That's you — removing yourself will revoke your access." : undefined}
              >
                {e}
                {isMe && <span className="ml-1 text-xs text-rose-600">(you)</span>}
              </span>
              <button
                type="button"
                onClick={() => onRemove(e)}
                className="text-slate-400 hover:text-rose-600 px-2"
                aria-label={`Remove ${e}`}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          onAdd()
        }}
        className="p-3 border-t border-slate-100 flex gap-2"
      >
        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
        >
          + Add
        </button>
      </form>
    </div>
  )
}

function OrganisationSection({
  config,
  onSaved,
}: {
  config: AppConfig
  onSaved: (next: AppConfig) => Promise<void>
}) {
  const [org, setOrg] = useState<OrganisationDetails>(config.organisation || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    setOrg(config.organisation || {})
  }, [config])

  const dirty = JSON.stringify(org) !== JSON.stringify(config.organisation || {})

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const next = await updateAdminConfig({ organisation: org })
      await onSaved(next)
      setSavedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="Organisation details"
      dirty={dirty}
      saving={saving}
      onSave={save}
      savedAt={savedAt}
      error={error}
    >
      <p className="text-sm text-slate-600 mb-4">
        These details appear on the cover page of PDF exports and in the &quot;Organisation details&quot; sheet of Excel exports.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ORG_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">{f.label}</span>
            <input
              type="text"
              value={org[f.key] || ''}
              onChange={(e) => setOrg({ ...org, [f.key]: e.target.value })}
              placeholder={f.placeholder || ''}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        ))}
      </div>
    </Section>
  )
}

function TomsLibrarySection({
  config,
  onSaved,
}: {
  config: AppConfig
  onSaved: (next: AppConfig) => Promise<void>
}) {
  const [items, setItems] = useState<string[]>(config.tomsLibrary || [])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    setItems(config.tomsLibrary || [])
  }, [config])

  const dirty = JSON.stringify(items) !== JSON.stringify(config.tomsLibrary || [])

  function update(idx: number, value: string) {
    setItems(items.map((it, i) => (i === idx ? value : it)))
  }
  function remove(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }
  function add() {
    const v = input.trim()
    if (!v) return
    if (items.some((it) => it.toLowerCase() === v.toLowerCase())) {
      setError(`"${v}" is already in the library.`)
      return
    }
    setError(null)
    setItems([...items, v])
    setInput('')
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const cleaned = items.map((s) => s.trim()).filter(Boolean)
      const next = await updateAdminConfig({ tomsLibrary: cleaned })
      await onSaved(next)
      setSavedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="TOMs library"
      dirty={dirty}
      saving={saving}
      onSave={save}
      savedAt={savedAt}
      error={error}
    >
      <p className="text-sm text-slate-600 mb-4">
        These appear as checkboxes when creating or editing a record.
      </p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <input
              type="text"
              value={it}
              onChange={(e) => update(i, e.target.value)}
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="px-2 text-slate-400 hover:text-rose-600"
              aria-label="Remove"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          add()
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Vulnerability scanning"
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
        >
          + Add
        </button>
      </form>
    </Section>
  )
}

function Section({
  title,
  children,
  dirty,
  saving,
  onSave,
  savedAt,
  error,
}: {
  title: string
  children: React.ReactNode
  dirty: boolean
  saving: boolean
  onSave: () => void
  savedAt: Date | null
  error: string | null
}) {
  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          {title}
          {dirty && (
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
          )}
        </h2>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="text-xs text-slate-400">Saved</span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-md p-3">
          {error}
        </div>
      )}
      {children}
    </div>
  )
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}
