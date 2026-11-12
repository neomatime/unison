'use client'

import { Popover } from '@base-ui/react/popover'
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'
import {
  WEEKDAYS,
  clampTime,
  compareDates,
  displayValue,
  formatDate,
  formatDateTime,
  monthGrid,
  monthName,
  parseDate,
  parseTime,
  shiftDate,
  type DateParts,
  type TimeParts,
} from '@/lib/ui/date-model'

/**
 * The app's date picker. A drop-in for `<input type="date">` and
 * `<input type="datetime-local">`: the value is the same `YYYY-MM-DD` /
 * `YYYY-MM-DDTHH:mm` string, carried in a real input so FormData is unchanged.
 */

const triggerClasses =
  'unison-field flex w-full min-h-10 cursor-pointer items-center justify-between gap-2 rounded-none border border-border bg-card px-3 text-left text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15'

export type DateChange = { target: { value: string; name: string }; currentTarget: { value: string; name: string } }

export type DatePickerProps = {
  name?: string
  id?: string
  type?: 'date' | 'datetime-local'
  value?: string | null
  defaultValue?: string | null
  onChange?: (event: DateChange) => void
  required?: boolean
  disabled?: boolean
  className?: string
  min?: string
  max?: string
  placeholder?: string
  form?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

const DEFAULT_TIME: TimeParts = { hour: 9, minute: 0 }

function todayParts(): DateParts {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

export function DatePicker({
  name,
  id,
  type = 'date',
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  className,
  min,
  max,
  placeholder,
  form,
  ...aria
}: DatePickerProps) {
  const withTime = type === 'datetime-local'
  const controlled = value !== undefined
  const initial = defaultValue ?? ''
  const [inner, setInner] = useState(initial)
  const current = controlled ? (value ?? '') : inner
  const selected = parseDate(current)
  const selectedTime = withTime ? (parseTime(current) ?? DEFAULT_TIME) : null
  const minDate = parseDate(min)
  const maxDate = parseDate(max)

  const [open, setOpen] = useState(false)
  const [focusDay, setFocusDay] = useState<DateParts>(() => selected ?? { year: 2000, month: 1, day: 1 })
  const gridRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogId = useId()

  useEffect(() => {
    const owner = inputRef.current?.form
    if (!owner || controlled) return
    const reset = () => setInner(initial)
    owner.addEventListener('reset', reset)
    return () => owner.removeEventListener('reset', reset)
  }, [controlled, initial])

  const grid = useMemo(() => monthGrid(focusDay.year, focusDay.month), [focusDay.year, focusDay.month])
  const today = open ? todayParts() : null

  // Keyboard focus follows the highlighted day once the calendar is on screen.
  useEffect(() => {
    if (!open) return
    gridRef.current?.querySelector<HTMLElement>('[data-focus="true"]')?.focus({ preventScroll: true })
  }, [open, focusDay])

  function outOfRange(day: DateParts) {
    return Boolean((minDate && compareDates(day, minDate) < 0) || (maxDate && compareDates(day, maxDate) > 0))
  }

  function emit(next: string) {
    if (!controlled) setInner(next)
    const target = { value: next, name: name ?? '' }
    onChange?.({ target, currentTarget: target })
  }

  function pick(day: DateParts, time: TimeParts | null = selectedTime) {
    if (outOfRange(day)) return
    emit(withTime ? formatDateTime(day, time ?? DEFAULT_TIME) : formatDate(day))
    if (!withTime) {
      setOpen(false)
      triggerRef.current?.focus()
    } else {
      setFocusDay(day)
    }
  }

  function setTime(next: TimeParts) {
    const day = selected ?? today ?? todayParts()
    emit(formatDateTime(day, next))
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) setFocusDay(selected ?? todayParts())
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const move = (change: { days?: number; months?: number }) => {
      event.preventDefault()
      setFocusDay((from) => shiftDate(from, change))
    }
    switch (event.key) {
      case 'ArrowLeft': return move({ days: -1 })
      case 'ArrowRight': return move({ days: 1 })
      case 'ArrowUp': return move({ days: -7 })
      case 'ArrowDown': return move({ days: 7 })
      case 'PageUp': return move({ months: event.shiftKey ? -12 : -1 })
      case 'PageDown': return move({ months: event.shiftKey ? 12 : 1 })
      case 'Home': return move({ days: -new Date(Date.UTC(focusDay.year, focusDay.month - 1, focusDay.day)).getUTCDay() })
      case 'End': return move({ days: 6 - new Date(Date.UTC(focusDay.year, focusDay.month - 1, focusDay.day)).getUTCDay() })
      case 'Enter':
      case ' ':
        event.preventDefault()
        pick(focusDay)
        return
      default:
    }
  }

  const label = displayValue(current, withTime)
  const invalid = aria['aria-invalid'] === true || aria['aria-invalid'] === 'true'
  const navButton = 'inline-flex size-9 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="relative min-w-0" data-slot="date-picker">
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
          aria-haspopup="dialog"
          className={cn(triggerClasses, className)}
        >
          <span className={cn('min-w-0 flex-1 truncate', !label && 'text-muted-foreground')}>
            {label || placeholder || (withTime ? 'Select date and time' : 'Select a date')}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={8} className="z-[80]">
            <Popover.Popup
              id={dialogId}
              initialFocus={false}
              role="dialog"
              aria-label={withTime ? 'Choose date and time' : 'Choose date'}
              className="w-[19rem] max-w-[calc(100vw-1rem)] max-h-[var(--available-height)] overflow-y-auto rounded-none border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex">
                  <button type="button" className={navButton} aria-label="Previous year" onClick={() => setFocusDay((d) => shiftDate(d, { months: -12 }))}>
                    <ChevronsLeft className="size-4" />
                  </button>
                  <button type="button" className={navButton} aria-label="Previous month" onClick={() => setFocusDay((d) => shiftDate(d, { months: -1 }))}>
                    <ChevronLeft className="size-4" />
                  </button>
                </div>
                <div className="text-sm font-semibold" aria-live="polite">
                  {monthName(focusDay.month)} {focusDay.year}
                </div>
                <div className="flex">
                  <button type="button" className={navButton} aria-label="Next month" onClick={() => setFocusDay((d) => shiftDate(d, { months: 1 }))}>
                    <ChevronRight className="size-4" />
                  </button>
                  <button type="button" className={navButton} aria-label="Next year" onClick={() => setFocusDay((d) => shiftDate(d, { months: 12 }))}>
                    <ChevronsRight className="size-4" />
                  </button>
                </div>
              </div>
              <div role="grid" aria-label={`${monthName(focusDay.month)} ${focusDay.year}`} ref={gridRef} onKeyDown={onGridKeyDown}>
                <div role="row" className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                  {WEEKDAYS.map((day) => (
                    <div key={day} role="columnheader" className="py-1">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {grid.map((cell) => {
                    const isSelected = selected !== null && compareDates(cell, selected) === 0
                    const isToday = today !== null && compareDates(cell, today) === 0
                    const isFocus = compareDates(cell, focusDay) === 0
                    const off = outOfRange(cell)
                    return (
                      <button
                        key={`${cell.year}-${cell.month}-${cell.day}`}
                        type="button"
                        role="gridcell"
                        tabIndex={isFocus ? 0 : -1}
                        data-focus={isFocus}
                        disabled={off}
                        aria-selected={isSelected}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={`${cell.day} ${monthName(cell.month)} ${cell.year}`}
                        onClick={() => pick(cell)}
                        className={cn(
                          'm-px flex h-10 items-center justify-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9',
                          cell.inMonth ? 'text-foreground' : 'text-muted-foreground/60',
                          !isSelected && !off && 'hover:bg-muted',
                          isToday && !isSelected && 'border border-brand text-brand',
                          isSelected && 'bg-brand font-medium text-brand-foreground',
                          off && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        {cell.day}
                      </button>
                    )
                  })}
                </div>
              </div>
              {withTime && selectedTime ? (
                <div className="mt-2 flex items-center gap-2 border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Time</span>
                  <TimeBox label="Hour" max={23} value={selectedTime.hour} onChange={(hour) => setTime(clampTime(hour, selectedTime.minute))} />
                  <span aria-hidden="true">:</span>
                  <TimeBox label="Minute" max={59} value={selectedTime.minute} onChange={(minute) => setTime(clampTime(selectedTime.hour, minute))} />
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                {required ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    className="px-2 py-2 font-medium text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      emit('')
                      setOpen(false)
                      triggerRef.current?.focus()
                    }}
                  >
                    Clear
                  </button>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-2 font-medium text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      const now = new Date()
                      const day = todayParts()
                      if (withTime) setFocusDay(day)
                      pick(day, withTime ? { hour: now.getHours(), minute: now.getMinutes() } : null)
                    }}
                  >
                    Today
                  </button>
                  {withTime ? (
                    <button
                      type="button"
                      className="bg-brand px-3 py-2 font-medium text-brand-foreground outline-none hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => {
                        setOpen(false)
                        triggerRef.current?.focus()
                      }}
                    >
                      Done
                    </button>
                  ) : null}
                </div>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}

function TimeBox({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (next: number) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={String(value).padStart(2, '0')}
      maxLength={2}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '')
        if (digits !== '') onChange(Math.min(max, Number(digits)))
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          const step = event.key === 'ArrowUp' ? 1 : -1
          onChange((value + step + max + 1) % (max + 1))
        }
      }}
      className="h-10 w-12 border border-border bg-card text-center text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15"
    />
  )
}
