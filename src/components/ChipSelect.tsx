import { useState } from 'react'

interface ChipSelectProps {
  options: readonly string[]
  value: string[]
  onChange: (next: string[]) => void
  allowCustom?: boolean
  placeholder?: string
}

export default function ChipSelect({ options, value, onChange, allowCustom = true, placeholder = 'Add custom…' }: ChipSelectProps) {
  const [custom, setCustom] = useState('')
  const selected = new Set(value)
  const customValues = value.filter((v) => !options.includes(v))

  function toggle(v: string) {
    if (selected.has(v)) {
      onChange(value.filter((x) => x !== v))
    } else {
      onChange([...value, v])
    }
  }

  function addCustom() {
    const v = custom.trim()
    if (!v || selected.has(v)) {
      setCustom('')
      return
    }
    onChange([...value, v])
    setCustom('')
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o)
          return (
            <button
              type="button"
              key={o}
              onClick={() => toggle(o)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset transition-colors ${
                on
                  ? 'bg-emerald-600 text-white ring-emerald-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {o}
            </button>
          )
        })}
        {customValues.map((cv) => (
          <button
            type="button"
            key={cv}
            onClick={() => toggle(cv)}
            className="px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset bg-emerald-600 text-white ring-emerald-600"
            title="Custom value — click to remove"
          >
            {cv} ×
          </button>
        ))}
      </div>
      {allowCustom && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder={placeholder}
            className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          />
          <button
            type="button"
            onClick={addCustom}
            className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
          >
            + Add
          </button>
        </div>
      )}
    </div>
  )
}
