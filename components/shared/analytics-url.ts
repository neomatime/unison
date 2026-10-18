// Keeps the quote portal's link token out of Vercel Web Analytics. The token is the credential and it sits in the
// address, so every analytics event for a portal page has its address replaced before it is sent. Pure: no directive
// and no imports, so unit tests can load it.

const REDACTED_PATH = '/q/redacted'

/** A path that is /q, or sits under /q/, whether it is followed by a query, a hash or nothing. */
const PORTAL_PATH = /^\/q(?:[/?#]|$)/

/**
 * Vercel Analytics `beforeSend`: an address whose path is /q or starts with /q/ becomes <origin>/q/redacted, with the
 * query and hash dropped. Every other event comes back as it was. A string that cannot be read as an absolute URL
 * never throws; it is returned as it came, except that a relative portal address is redacted too, since it carries
 * the same token.
 */
export function redactPortalUrl<T extends { url: string }>(event: T): T {
  const url = event.url
  if (typeof url !== 'string') return event
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return PORTAL_PATH.test(url) ? { ...event, url: REDACTED_PATH } : event
  }
  if (!PORTAL_PATH.test(parsed.pathname)) return event
  return { ...event, url: `${parsed.protocol}//${parsed.host}${REDACTED_PATH}` }
}
