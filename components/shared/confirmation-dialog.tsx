'use client'

import { useEffect, useId, useRef, useState } from 'react'

type ConfirmationDialogProps = { open: boolean; title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void | Promise<void> }

/** A destructive-action confirmation that restores focus and prevents duplicate submission. */
export function ConfirmationDialog({ open, title, description, confirmLabel, onCancel, onConfirm }: ConfirmationDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const dialog = useRef<HTMLElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancel.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) { event.preventDefault(); onCancel(); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const index = focusable.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus() }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previousFocus.current?.focus() }
  }, [onCancel, open])

  async function confirm() {
    if (submitting) return
    submittingRef.current = true
    setSubmitting(true)
    try { await onConfirm() } finally { submittingRef.current = false; setSubmitting(false) }
  }

  if (!open) return null
  return <div className="unison-overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="presentation" onMouseDown={() => !submitting && onCancel()}>
    <section ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onMouseDown={(event) => event.stopPropagation()} className="unison-dialog-enter w-full max-w-md rounded-none border border-border bg-card p-6 shadow-2xl">
      <h2 id={titleId} className="unison-section-title text-sm text-foreground">{title}</h2>
      <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button ref={cancel} type="button" disabled={submitting} onClick={onCancel} className="unison-action-control rounded-none border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20">Cancel</button>
        <button type="button" disabled={submitting} aria-busy={submitting} onClick={() => void confirm()} className="unison-action-control rounded-none bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30">{submitting ? 'Working…' : confirmLabel}</button>
      </div>
    </section>
  </div>
}
