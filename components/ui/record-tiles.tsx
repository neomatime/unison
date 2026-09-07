/**
 * Read-only tiles for a record detail page.
 *
 * `SummaryTile` is the bordered row across the top of a record — the handful of
 * values worth seeing before anything else. `DetailTile` is the filled tile used
 * in the fuller grid below it.
 *
 * Both render an em dash for an absent value rather than an empty space, so a
 * missing field reads as "we have nothing here" instead of looking broken. That
 * matters more than it sounds: the Clients workspace shows an em dash for
 * "Active projects" precisely because a fabricated 0 would be a lie.
 */

export function SummaryTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-none border border-border p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="unison-record-name mt-2 text-sm">{value ?? '—'}</p>
    </div>
  )
}

export function DetailTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <p className="unison-metric-label text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value ?? '—'}</p>
    </div>
  )
}
