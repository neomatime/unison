// Builds an RFC 5322 multipart/alternative message.
//
// Graph's JSON sendMail carries exactly one body contentType, so using it would
// mean dropping either the HTML or the plain-text alternative. The text part is
// worth keeping: it is what plain-text and accessibility clients render, it
// helps deliverability, and it is the part deliberately hardened against
// injection in templates/invitation.ts. Graph also accepts a raw MIME message,
// which preserves both — so we build one.
//
// Pure and I/O-free on purpose, so it can be unit-tested without credentials.

const CRLF = '\r\n'

/**
 * Strips CR and LF from a header value.
 *
 * Header injection defence. Templates already collapse newlines in the fields
 * they interpolate, but header safety was previously nodemailer's job and is
 * now ours — a second line of defence belongs at the point where headers are
 * actually assembled, not only at the point where values are composed.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * RFC 2047 encodes a header value when it contains non-ASCII.
 *
 * An organization name may be in any script. Left raw, non-ASCII bytes in a
 * header are not portable across mail servers.
 */
export function encodeHeaderValue(value: string): string {
  const safe = sanitizeHeaderValue(value)
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(safe)) return safe
  return `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`
}

/** Extracts the bare address from `Display Name <addr@host>`, or returns it unchanged. */
export function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/)
  return (match ? match[1] : value).trim()
}

function base64Body(value: string): string {
  // Wrapped at 76 characters: RFC 2045 caps encoded lines, and some servers
  // reject or mangle longer ones.
  return (Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join(CRLF)
}

export function buildMimeMessage(input: {
  from: string
  to: string
  subject: string
  text: string
  html: string
  boundary?: string
}): string {
  const boundary = input.boundary ?? `unison-${crypto.randomUUID()}`

  return [
    `From: ${sanitizeHeaderValue(input.from)}`,
    `To: ${sanitizeHeaderValue(input.to)}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    // Least-preferred alternative first, most-preferred last: clients render
    // the last part they understand.
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(input.html),
    `--${boundary}--`,
    '',
  ].join(CRLF)
}
