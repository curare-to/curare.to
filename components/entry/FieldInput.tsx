'use client'

import type { FieldDef } from '@/lib/protocol/curated'

const base =
  'w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none'

/** One input per field type. The schema says what it is; this says how to ask. */
export function FieldInput({
  field,
  value,
  error,
  onChange,
  required,
  anyOf,
}: {
  field: FieldDef
  value: string
  error?: string
  onChange: (value: string) => void
  required: boolean
  /** The labels of a require-any group this field belongs to. */
  anyOf?: string[] | null
}) {
  const id = `field-${field.name}`
  const border = error ? 'border-danger' : 'border-line'
  const common = {
    id,
    value,
    'aria-invalid': !!error,
    'aria-describedby': error ? `${id}-error` : field.config.hint ? `${id}-hint` : undefined,
  }

  let input: React.ReactNode
  switch (field.type) {
    case 'longtext':
      input = (
        <textarea
          {...common}
          rows={6}
          placeholder={field.placeholder}
          maxLength={field.config.max}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border} min-h-32`}
        />
      )
      break
    case 'enum':
      input = (
        <select {...common} onChange={(e) => onChange(e.target.value)} className={`${base} ${border}`}>
          {!required ? <option value="">—</option> : null}
          {(field.config.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
      break
    case 'year':
    case 'number':
    case 'duration':
      input = (
        <input
          {...common}
          type="number"
          inputMode="numeric"
          placeholder={field.placeholder}
          min={field.config.min}
          max={field.config.max}
          step={1}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border}`}
        />
      )
      break
    case 'url':
    case 'image':
      input = (
        <input
          {...common}
          type="url"
          inputMode="url"
          placeholder={field.placeholder || 'https://…'}
          maxLength={field.config.max}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border}`}
        />
      )
      break
    default:
      input = (
        <input
          {...common}
          type="text"
          placeholder={field.placeholder}
          maxLength={field.config.max}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border}`}
        />
      )
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {field.label}
        {required ? (
          <span className="text-danger"> *</span>
        ) : anyOf ? (
          <span className="text-muted"> (one of {anyOf.join(', ')})</span>
        ) : (
          <span className="text-muted"> (optional)</span>
        )}
      </label>
      {input}
      {field.config.hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {field.config.hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
