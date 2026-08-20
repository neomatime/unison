import Link from 'next/link'
import { Info } from 'lucide-react'

/**
 * The chrome around a connected module's create/edit form: grouped sections and
 * the sticky save bar.
 *
 * Extracted from the Clients form. What stays per-module is which fields exist
 * and how they group; everything visual lives here so the fifteen remaining
 * modules do not each carry their own copy of it.
 */

export function FormSection({
  title,
  description,
  children,
  columns = 2,
}: {
  title: string
  description?: string
  children: React.ReactNode
  columns?: 1 | 2
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <div className="mb-5">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className={columns === 2 ? 'grid gap-5 md:grid-cols-2' : 'grid gap-5'}>{children}</div>
    </section>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {message}
    </p>
  )
}

/**
 * The sticky bar carrying cancel and submit.
 *
 * `pending` disables the submit and swaps its label, so a slow save cannot be
 * double-submitted. The reassurance text is deliberate: these forms write to a
 * real database, and saying so distinguishes a connected module from the
 * fifteen that still render fixtures.
 */
export function FormFooter({
  cancelHref,
  submitLabel,
  pending,
  note = 'Changes are saved to UNISON’s database.',
}: {
  cancelHref: string
  submitLabel: string
  pending?: boolean
  note?: string
}) {
  return (
    <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-border bg-card/95 px-5 py-4 shadow-xl backdrop-blur">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-4" />
        {note}
      </p>
      <div className="flex gap-2">
        <Link href={cancelHref} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
