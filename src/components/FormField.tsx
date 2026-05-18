import { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export default function FormField({ label, htmlFor, hint, error, required, children }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      {children}
      {hint && !error && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
      {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}
    </div>
  )
}
