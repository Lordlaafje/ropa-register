import { ReactNode, useState } from 'react'

interface FormSectionProps {
  title: string
  description?: string
  defaultOpen?: boolean
  children: ReactNode
}

export default function FormSection({ title, description, defaultOpen = true, children }: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <div className="text-xs text-slate-500 mt-0.5">{description}</div>}
        </div>
        <span className="text-slate-400 text-sm">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100">
          <div className="space-y-4 mt-3">{children}</div>
        </div>
      )}
    </div>
  )
}
