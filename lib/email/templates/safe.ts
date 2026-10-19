// Escaping and validation shared by every HTML email template. Pure: no imports, no directive.

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:'])
const MAX_FIELD_LENGTH = 200

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!
  ))
}

// organizationName and invitedBy are database-sourced and attacker-influenced
// in a multi-tenant product. Without this, a name containing CR/LF could
// inject fabricated content (e.g. a second "Accept the invitation" block)
// into the plain-text body — content spoofing inside an otherwise trustworthy
// transactional email. Collapse newlines and whitespace runs, trim, and cap
// length so a pathological name can't dominate the email either.
export function sanitizeLine(value: string, maxLength = MAX_FIELD_LENGTH): string {
  const collapsed = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}…` : collapsed
}

// Entity-escaping (escapeHtml) prevents breaking out of the href="..."
// attribute, but does nothing to stop a scheme like `javascript:` from
// executing when the link is clicked — that requires validating the scheme
// itself. Parse with the WHATWG URL constructor rather than string matching,
// and allow only absolute http(s) URLs. Reject by throwing rather than
// silently dropping the link, so a programming error surfaces loudly at send
// time instead of shipping a dead or dangerous button inside a trusted
// HIMARK email. The URL a template is given is application-constructed today,
// not user-supplied, but templates are reusable components and a future
// caller may not preserve that invariant. `label` names the offending field
// in the error text (for example "invitationTemplate: acceptUrl").
export function assertSafeUrl(value: string, label: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${label} is not a valid absolute URL: ${value}`)
  }
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${label} has a disallowed protocol "${parsed.protocol}": ${value}`)
  }
  return value
}
