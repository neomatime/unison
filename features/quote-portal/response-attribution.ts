// Who set a quote's Accepted or Declined status, and how the terms a response was made against are named for staff. Pure:
// no directive and no imports, so unit tests can load it.

type Decided = { decision: 'accepted' | 'declined'; decided_at: string }

/** The quote status each recorded decision stands for. */
const STATUS_OF: Record<Decided['decision'], string> = { accepted: 'Accepted', declined: 'Declined' }

/**
 * Whether the status of a quote is the client's doing.
 *
 * `null` unless the status is Accepted or Declined: no other status claims a decision. Otherwise `'client'` when the newest
 * response (by instant, whatever offset it was written with) made the decision the status names, and `'staff'` when it
 * did not: the quote was marked by hand (a phone acceptance, so no response at all) or staff changed it after the client
 * answered. A time that cannot be read is never the newest. Two responses at the same instant: the one listed first
 * counts, which is the newest in the order the query returns them.
 */
export function responseAttribution(status: string, responses: Decided[]): 'client' | 'staff' | null {
  if (status !== STATUS_OF.accepted && status !== STATUS_OF.declined) return null
  let newest: Decided | null = null
  let newestAt = Number.NEGATIVE_INFINITY
  for (const response of responses) {
    const at = new Date(response.decided_at).getTime()
    const instant = Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at
    if (newest === null || instant > newestAt) {
      newest = response
      newestAt = instant
    }
  }
  return newest !== null && STATUS_OF[newest.decision] === status ? 'client' : 'staff'
}

/**
 * The terms a response was made against, as `layer v<version>` for each entry of the quote's recorded terms sources
 * (`company v3`). Anything that is not a list gives none, and an entry without a layer name or a version number is left
 * out, so a malformed record never stops the page.
 */
export function termsVersionLabels(termsSources: unknown): string[] {
  if (!Array.isArray(termsSources)) return []
  return termsSources.flatMap((source: unknown) => {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return []
    const { layer, version } = source as { layer?: unknown; version?: unknown }
    if (typeof layer !== 'string' || layer.trim() === '') return []
    if (typeof version !== 'number' || !Number.isFinite(version)) return []
    return [`${layer.trim()} v${version}`]
  })
}
