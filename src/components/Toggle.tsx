interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
}

export default function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group flex items-start gap-3 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`mt-0.5 inline-flex h-5 w-9 flex-shrink-0 rounded-full border transition-colors ${
          checked
            ? 'bg-emerald-600 border-emerald-600'
            : 'bg-slate-200 border-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          } mt-0.5`}
        />
      </span>
      {(label || description) && (
        <span className="flex-1">
          {label && <span className="block text-sm font-medium text-slate-800">{label}</span>}
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </span>
      )}
    </button>
  )
}
