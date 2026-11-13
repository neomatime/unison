'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent } from 'react'
import type React from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'

export type ConfirmOptions = {
  /** What is being asked, in one line. */
  title?: string
  /** The question or the warning. */
  message: string
  confirmLabel?: string
  /** `danger` (the default) for something that cannot be undone. */
  tone?: 'danger' | 'default'
}

type Ask = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask | null>(null)

/**
 * UNISON's own yes or no dialog, in place of the browser's pop-up. `const confirm = useConfirm()` then
 * `if (!(await confirm({ message: '…' }))) return`. One dialog is shown at a time.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((answer: boolean) => void) | null>(null)

  const ask = useCallback<Ask>((next) => {
    // A second question while one is open counts as "no" to the first, so nothing is left waiting forever.
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setOptions(next)
    })
  }, [])

  const answer = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }, [])

  const value = useMemo(() => ask, [ask])
  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmationDialog
        open={options !== null}
        title={options?.title ?? 'Are you sure?'}
        description={options?.message ?? ''}
        confirmLabel={options?.confirmLabel ?? 'Confirm'}
        tone={options?.tone ?? 'danger'}
        onCancel={() => answer(false)}
        onConfirm={() => answer(true)}
      />
    </ConfirmContext.Provider>
  )
}

// Outside a provider (a component rendered on its own, as the tests do) the browser's own question is the safe fallback.
const fallback: Ask = (options) => Promise.resolve(typeof window !== 'undefined' ? window.confirm(options.message) : false)

export function useConfirm(): Ask {
  return useContext(ConfirmContext) ?? fallback
}

/**
 * For a form that posts to a server action: asks first, and only then lets the submit through. Pass null to skip the
 * question. Use as `<form action={action} onSubmit={useConfirmedSubmit(options)}>`.
 */
export function useConfirmedSubmit(options: ConfirmOptions | null) {
  const confirm = useConfirm()
  const confirmed = useRef(false)
  return async (event: FormEvent<HTMLFormElement>) => {
    if (!options) return
    if (confirmed.current) {
      confirmed.current = false
      return
    }
    event.preventDefault()
    const form = event.currentTarget
    if (await confirm(options)) {
      confirmed.current = true
      form.requestSubmit()
    }
  }
}
