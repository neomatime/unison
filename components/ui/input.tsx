'use client'

import type { ChangeEvent, ComponentProps } from 'react'

import { DatePicker } from '@/components/ui/date-picker'

/**
 * An `<input>` whose `type` arrives as a variable. Date and date-time types
 * get the app's date picker; every other type is a plain input. Used by the
 * shared form-field wrappers so a `type="date"` field anywhere picks the
 * app's calendar without each wrapper branching.
 */
export function AppInput(props: ComponentProps<'input'>) {
  const { type, value, defaultValue, onChange, min, max, autoFocus: _autoFocus, ...rest } = props
  if (type !== 'date' && type !== 'datetime-local') return <input type={type} value={value} defaultValue={defaultValue} onChange={onChange} min={min} max={max} {...rest} />
  return (
    <DatePicker
      type={type as 'date' | 'datetime-local'}
      name={rest.name}
      id={rest.id}
      required={rest.required}
      disabled={rest.disabled}
      className={rest.className}
      placeholder={rest.placeholder}
      form={rest.form}
      min={typeof min === 'string' ? min : undefined}
      max={typeof max === 'string' ? max : undefined}
      value={value === undefined ? undefined : String(value ?? '')}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue ?? '')}
      aria-label={rest['aria-label']}
      aria-labelledby={rest['aria-labelledby']}
      aria-invalid={rest['aria-invalid'] === true || rest['aria-invalid'] === 'true' ? true : undefined}
      onChange={onChange ? (event) => onChange(event as unknown as ChangeEvent<HTMLInputElement>) : undefined}
    />
  )
}
