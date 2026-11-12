'use client'

import { Popover } from '@base-ui/react/popover'
import { Check, ChevronDown, Search } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'
import {
  filterOptions,
  nextEnabledIndex,
  readOptions,
  shouldShowSearch,
  type SelectOption,
} from '@/lib/ui/select-model'

/**
 * The app's dropdown. A drop-in for `<select>`: it takes the same `<option>` /
 * `<optgroup>` children and the same `name`, `value`, `defaultValue`,
 * `required`, `disabled` and `onChange` props, and carries its value in a real
 * input so server actions keep receiving the same FormData. Lists longer than
 * five options get a search box.
 */

const triggerClasses =
  'unison-field flex w-full items-center justify-between gap-2 rounded-none border border-border bg-card px-3 text-left text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15'

export type SelectChange = { target: { value: string; name: string }; currentTarget: { value: string; name: string } }

export type SelectProps = {
  name?: string
  id?: string
  value?: string | number | null
  defaultValue?: string | number | null
  onChange?: (event: SelectChange) => void
  required?: boolean
  disabled?: boolean
  className?: string
  children?: ReactNode
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  form?: string
  /** Always show (true) or never show (false) the search box; by default it appears above five options. */
  searchable?: boolean
  searchPlaceholder?: string
  placeholder?: string
}

export function Dropdown({
  name,
  id,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  className,
  children,
  searchable,
  searchPlaceholder = 'Search…',
  placeholder,
  form,
  ...aria
}: SelectProps) {
  const options = useMemo(() => readOptions(children), [children])
  const controlled = value !== undefined
  const initial = String(defaultValue ?? options[0]?.value ?? '')
  const [inner, setInner] = useState(initial)
  const current = controlled ? String(value ?? '') : inner
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const generatedId = useId()
  const listId = `${generatedId}-list`
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const showSearch = searchable ?? shouldShowSearch(options.length)
  const visible = useMemo(() => filterOptions(options, query), [options, query])
  const selected = options.find((option) => option.value === current) ?? null
  // A native select with no matching value shows its first option; keep that unless a placeholder was given.
  const shown = selected ?? (placeholder ? null : (options[0] ?? null))

  // A server-action form resets after submit; put an uncontrolled dropdown back to its default.
  useEffect(() => {
    const owner = inputRef.current?.form
    if (!owner || controlled) return
    const reset = () => setInner(initial)
    owner.addEventListener('reset', reset)
    return () => owner.removeEventListener('reset', reset)
  }, [controlled, initial])

  const commit = useCallback(
    (option: SelectOption) => {
      if (option.disabled) return
      if (!controlled) setInner(option.value)
      const target = { value: option.value, name: name ?? '' }
      onChange?.({ target, currentTarget: target })
      setOpen(false)
      triggerRef.current?.focus()
    },
    [controlled, name, onChange],
  )

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setQuery('')
      setActive(Math.max(options.findIndex((option) => option.value === current), 0))
    }
  }

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active, visible])

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((from) => nextEnabledIndex(visible, from, 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((from) => nextEnabledIndex(visible, from, -1))
    } else if (event.key === 'Home' && !showSearch) {
      event.preventDefault()
      setActive(nextEnabledIndex(visible, -1, 1))
    } else if (event.key === 'End' && !showSearch) {
      event.preventDefault()
      setActive(nextEnabledIndex(visible, 0, -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = visible[active]
      if (option) commit(option)
    } else if (!showSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Typeahead for short lists that have no search box.
      const letter = event.key.toLowerCase()
      const after = visible.findIndex((option, index) => index > active && option.label.toLowerCase().startsWith(letter))
      const first = visible.findIndex((option) => option.label.toLowerCase().startsWith(letter))
      const at = after >= 0 ? after : first
      if (at >= 0) setActive(at)
    }
  }

  const activeId = visible[active] ? `${generatedId}-opt-${active}` : undefined
  const invalid = aria['aria-invalid'] === true || aria['aria-invalid'] === 'true'

  return (
    <div className="relative min-w-0" data-slot="select">
      {/* The value the form submits. When required it is a transparent text input (not read-only: those skip validation) so the browser's own
          "fill out this field" check still fires; focusing it hands focus to the visible control. */}
      <input
        ref={inputRef}
        name={name}
        form={form}
        value={current}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        type={required ? 'text' : 'hidden'}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        onChange={() => {}}
        onFocus={() => triggerRef.current?.focus()}
      />
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger
          ref={triggerRef}
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-label={aria['aria-label']}
          aria-labelledby={aria['aria-labelledby']}
          aria-haspopup="listbox"
          className={cn(triggerClasses, 'min-h-10 cursor-pointer', className)}
          onKeyDown={(event) => {
            if (open) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              onOpenChange(true)
            }
          }}
        >
          <span className={cn('min-w-0 flex-1 truncate', !shown && 'text-muted-foreground')}>{shown?.label || placeholder || ' '}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={8} className="z-[80]">
            <Popover.Popup
              initialFocus={showSearch ? searchRef : listRef}
              className="flex max-h-[min(20rem,var(--available-height))] w-[max(var(--anchor-width),12rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-none border border-border bg-popover text-popover-foreground shadow-lg outline-none"
              onKeyDown={onKeyDown}
            >
              {showSearch ? (
                <div className="flex items-center gap-2 border-b border-border px-3">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setActive(0)
                    }}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={activeId}
                    aria-label="Search options"
                    placeholder={searchPlaceholder}
                    autoComplete="off"
                    className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              ) : null}
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                tabIndex={-1}
                aria-label={aria['aria-label']}
                aria-activedescendant={showSearch ? undefined : activeId}
                className="min-h-0 flex-1 overflow-y-auto py-1 outline-none"
              >
                {visible.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted-foreground" role="presentation">
                    No matches
                  </li>
                ) : null}
                {visible.map((option, index) => {
                  const showGroup = option.group !== null && option.group !== visible[index - 1]?.group
                  return (
                    <li key={`${option.group ?? ''}-${option.value}-${index}`} role="presentation">
                      {showGroup ? (
                        <div className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{option.group}</div>
                      ) : null}
                      <div
                        id={`${generatedId}-opt-${index}`}
                        role="option"
                        aria-selected={option.value === current}
                        aria-disabled={option.disabled || undefined}
                        data-active={index === active}
                        onMouseMove={() => setActive(index)}
                        onClick={() => commit(option)}
                        className={cn(
                          'flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm sm:min-h-9',
                          index === active && 'bg-muted',
                          option.value === current && 'font-medium text-brand',
                          option.disabled && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className="min-w-0 break-words">{option.label || ' '}</span>
                        {option.value === current ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
