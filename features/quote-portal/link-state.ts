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

/**
 * Whether an email to this link's recipient was recorded at or after the link was made (less one minute, because the
 * link is made just before the message is sent and the two clocks are the database's). A link can exist without its
 * email in the rare cases where the send failed after the link was made, so staff are shown this rather than told
 * that an active link was emailed. Addresses are compared without regard to case or surrounding spaces.
 */
export function isLinkEmailConfirmed(
  link: { recipient_email: string; created_at: string },
  emails: Array<{ to_address: string; sent_at: string }>,
): boolean {
  const created = Date.parse(link.created_at)
  if (!Number.isFinite(created)) return false
  const recipient = link.recipient_email.trim().toLowerCase()
  return emails.some((email) => {
    const sent = Date.parse(email.sent_at)
    return Number.isFinite(sent) && sent >= created - ONE_MINUTE && email.to_address.trim().toLowerCase() === recipient
  })
}
