import { cn } from '@/lib/utils'

/**
 * The three input shapes every connected module's create/edit form needs.
 *
 * Extracted from the Clients form so module two does not copy them. Each one
 * is uncontrolled and named — the surrounding form is a server action reading
 * `FormData`, so there is no per-field state to manage and nothing here needs
 * to be a client component.
 */

export const fieldClasses =
  'unison-field mt-1.5 min-h-10 w-full rounded-none border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15'

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
  <span className="text-sm font-medium text-foreground transition-colors group-focus-within:text-brand">
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
  placeholder,
  className,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  defaultValue?: string | null
  placeholder?: string
  className?: string
}) {
  return (
    <label className={cn('group block', className)}>
      <FieldLabel label={label} required={required} />
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
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
    <label className={cn('group block', className)}>
      <FieldLabel label={label} />
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        className="unison-field mt-1.5 w-full rounded-none border border-border bg-card px-3 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15"
      />
    </label>
  )
}

/**
 * A select whose option values are ids and whose labels are names.
 *
 * SelectField renders `<option value={option}>{option}</option>`, so it can only
 * express choices where the value and the label are the same string. Foreign
 * keys are not like that. Kept as a sibling rather than a widened SelectField so
 * the simple case stays simple.
 */
export function EntitySelectField({
  name,
  label,
  options,
  defaultValue,
  required,
  emptyLabel,
  className,
}: {
  name: string
  label: string
  options: ReadonlyArray<{ id: string; name: string }>
  defaultValue?: string | null
  required?: boolean
  emptyLabel?: string
  className?: string
}) {
  return (
    <label className={cn('group block', className)}>
      <FieldLabel label={label} required={required} />
      <select name={name} defaultValue={defaultValue ?? ''} required={required} className={`${fieldClasses} cursor-pointer`}>
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
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
    <label className={cn('group block', className)}>
      <FieldLabel label={label} required={required} />
      <select name={name} defaultValue={defaultValue} required={required} className={`${fieldClasses} cursor-pointer`}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
