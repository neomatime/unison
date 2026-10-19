// What staff see for a portal link: its state, and whether the email that carried it is known to have gone out. Pure: no
// directive and no imports, so unit tests can load it.

export type LinkState = 'Active' | 'Expired' | 'Revoked' | 'Superseded' | 'Not sent'

/**
 * The state of one link at `now`.
 *
 * The reasons the system itself gives are read first: 'superseded' (a revision was sent), 'email not sent' (the message
 * never went out, so the link was withdrawn) and 'expired' (the nightly job closed the quote). Any other reason on a
 * revoked link is a person's: Revoked. A link nobody revoked is Expired from the instant `expires_at` arrives
 * (`now === expires_at` is Expired), and Active before it.
 *
 * 'expired' is deliberately not Revoked: no one revoked it, and the database rewrites that reason to 'revoked by staff'
 * when a person supplies it. The link is past its date by construction, so this is also what the date rule alone says.
 */
export function linkState(link: { expires_at: string; revoked_at: string | null; revoked_reason: string | null }, now: Date): LinkState {
  if (link.revoked_at) {
    if (link.revoked_reason === 'superseded') return 'Superseded'
    if (link.revoked_reason === 'email not sent') return 'Not sent'
    if (link.revoked_reason === 'expired') return 'Expired'
    return 'Revoked'
  }
  const expiresAt = Date.parse(link.expires_at)
  // An expiry that cannot be read is never called Active: staff would be told a link works when nothing says it does.
  if (!Number.isFinite(expiresAt) || now.getTime() >= expiresAt) return 'Expired'
  return 'Active'
}

const ONE_MINUTE = 60_000

type LinkKey = { id: string; recipient_email: string; created_at: string }

const sameAddress = (address: string) => address.trim().toLowerCase()

/**
 * Whether an email on record is the one this link was sent with.
 *
 * An email confirms at most one link: the latest link to the same address that was made at or before the email was
 * sent, plus a minute (the link is made just before the message goes out, and both clocks are the database's). A link is
 * confirmed when some email chooses it. So when a send fails and staff retry, the retry's email confirms the retry's
 * link and never the abandoned one before it; and a link whose email never went out is not confirmed by a later send.
 * Addresses are compared without regard to case or surrounding spaces, and times as instants whatever offset they were
 * written with. A time that cannot be read takes no part. `allLinks` is every link of the quote, in any order,
 * and includes `link`; two links made at the same instant to one address are told apart by id, so the answer is stable.
 *
 * Staff are shown this rather than told that an active link was emailed: a link can exist whose email never went out.
 */
export function isLinkEmailConfirmed(link: LinkKey, allLinks: LinkKey[], emails: Array<{ to_address: string; sent_at: string }>): boolean {
  const recipient = sameAddress(link.recipient_email)
  for (const email of emails) {
    if (sameAddress(email.to_address) !== recipient) continue
    const sent = Date.parse(email.sent_at)
    if (!Number.isFinite(sent)) continue
    let chosen: { id: string; created: number } | null = null
    for (const candidate of allLinks) {
      if (sameAddress(candidate.recipient_email) !== recipient) continue
      const created = Date.parse(candidate.created_at)
      if (!Number.isFinite(created) || created > sent + ONE_MINUTE) continue
      if (!chosen || created > chosen.created || (created === chosen.created && candidate.id > chosen.id)) chosen = { id: candidate.id, created }
    }
    if (chosen?.id === link.id) return true
  }
  return false
}
