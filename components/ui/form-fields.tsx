import { cn } from '@/lib/utils'

/**
 * The three input shapes every connected module's create/edit form needs.
 *
 * Extracted from the Clients form so module two does not copy them. Each one
 * is uncontrolled and named — the surrounding form is a server action reading
 * `FormData`, so there is no per-field state to manage and nothing here needs
 * to be a client component.
 */

const fieldClasses =
  'mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20'

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="text-sm font-medium text-foreground">
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
    </span>
  )
}

export function TextField({
  name,
  label,
  type = 'text',
  required,
  defaultValue,
  className,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  defaultValue?: string | null
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <FieldLabel label={label} required={required} />
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ''}
        className={fieldClasses}
      />
    </label>
  )
}

export function TextAreaField({
  name,
  label,
  defaultValue,
  placeholder,
  rows = 5,
  className,
}: {
  name: string
  label: string
  defaultValue?: string | null
  placeholder?: string
  rows?: number
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <FieldLabel label={label} />
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
    </label>
  )
}

export function SelectField<T extends readonly string[]>({
  name,
  label,
  options,
  defaultValue,
  required,
  className,
}: {
  name: string
  label: string
  options: T
  defaultValue: string
  required?: boolean
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <FieldLabel label={label} required={required} />
      <select name={name} defaultValue={defaultValue} required={required} className={fieldClasses}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
