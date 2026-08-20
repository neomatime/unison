import Link from 'next/link'
import { Archive } from 'lucide-react'

/**
 * The two-step archive flow, shared so every connected module gets the same one.
 *
 * WHY THIS IS NOT A DIALOG. The confirmation is a plain link to
 * `?confirm=archive` followed by a form post — no `confirm()`, no client-side
 * modal. That means the "are you sure" step is guaranteed to appear even if
 * JavaScript never loads or has not hydrated. A client-only dialog leaves a
 * window in which the archive button submits with no confirmation at all, and
 * there is no unarchive control in the UI, so an accidental archive is
 * unrecoverable without database access.
 *
 * Extracted from the Clients detail page. It is the piece most likely to be
 * copied wrongly, because a dialog looks like the obvious implementation and
 * the failure only shows up on a slow connection.
 */

/** The query parameter every module uses to enter the confirmation step. */
export const ARCHIVE_CONFIRM_PARAM = 'confirm'
export const ARCHIVE_CONFIRM_VALUE = 'archive'

export function archiveConfirmHref(detailHref: string): string {
  return `${detailHref}?${ARCHIVE_CONFIRM_PARAM}=${ARCHIVE_CONFIRM_VALUE}`
}

/** Reads the confirmation state out of a route's resolved searchParams. */
export function isArchiveConfirming(searchParams: { confirm?: string }): boolean {
  return searchParams.confirm === ARCHIVE_CONFIRM_VALUE
}

export function ArchiveTrigger({ detailHref, label }: { detailHref: string; label: string }) {
  return (
    <Link
      href={archiveConfirmHref(detailHref)}
      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-destructive"
    >
      <Archive className="size-4" />
      {label}
    </Link>
  )
}

export function ArchiveConfirmation({
  recordName,
  cancelHref,
  action,
  title,
  description = 'This removes it from the active list. There is no undo through the UI.',
  confirmLabel,
}: {
  recordName: string
  cancelHref: string
  action: () => void | Promise<void>
  title?: string
  description?: string
  confirmLabel: string
}) {
  return (
    <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-semibold text-destructive">{title ?? `Archive ${recordName}?`}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex gap-2">
        <Link href={cancelHref} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
          Cancel
        </Link>
        {/* A real form post, not an onClick — this is what survives no JS. */}
        <form action={action}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white"
          >
            <Archive className="size-4" />
            {confirmLabel}
          </button>
        </form>
      </div>
    </div>
  )
}
