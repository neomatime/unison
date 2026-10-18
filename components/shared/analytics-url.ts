// Keeps the quote portal's link token out of Vercel Web Analytics. The token is the credential and it sits in the
// address, so analytics is not loaded on a portal page at all (isPortalPath, used by SafeAnalytics), and every event
// that is sent has any portal address replaced first (redactPortalUrl, the `beforeSend` hook). Pure: no directive and
// no imports, so unit tests can load it.

const REDACTED_PATH = '/q/redacted'

/**
 * True for the pathname `/q` and for any pathname under `/q/`, and for nothing else: not `/quotes`, not `/qq/x`, not
 * `/Q/x` (routes are case-sensitive), not a value that is not a string. Takes a pathname, with no query or hash.
 */
export function isPortalPath(pathname: unknown): boolean {
  return typeof pathname === 'string' && (pathname === '/q' || pathname.startsWith('/q/'))
}

/** A string that starts at /q, or at /q/, with a query, a hash or nothing after it: a relative portal address. */
const RELATIVE_PORTAL_ADDRESS = /^\/q(?:[/?#]|$)/

/** A protocol-relative portal address, `//host/q/...`: the host is kept, as the group, and the path is replaced. */
const PROTOCOL_RELATIVE_PORTAL_ADDRESS = /^(\/\/[^/?#]+)\/q(?:[/?#]|$)/

/**
 * Vercel Analytics `beforeSend`: an address whose path is /q or starts with /q/ becomes <origin>/q/redacted, with the
 * query and hash dropped. Every other event comes back as it was. A string that cannot be read as an absolute URL
 * never throws; it is returned as it came, except that a relative (`/q/...`) or protocol-relative (`//host/q/...`)
 * portal address is redacted too, since it carries the same token.
 */
export function redactPortalUrl<T extends { url: string }>(event: T): T {
  const url = event.url
  if (typeof url !== 'string') return event
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    if (RELATIVE_PORTAL_ADDRESS.test(url)) return { ...event, url: REDACTED_PATH }
    const protocolRelative = PROTOCOL_RELATIVE_PORTAL_ADDRESS.exec(url)
    return protocolRelative ? { ...event, url: `${protocolRelative[1]}${REDACTED_PATH}` } : event
  }
  if (!isPortalPath(parsed.pathname)) return event
  return { ...event, url: `${parsed.protocol}//${parsed.host}${REDACTED_PATH}` }
}
