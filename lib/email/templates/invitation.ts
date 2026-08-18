export type EmailTemplate = { subject: string; html: string; text: string }

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:'])
const MAX_FIELD_LENGTH = 200

function escapeHtml(value: string): string {
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
function sanitizeLine(value: string, maxLength = MAX_FIELD_LENGTH): string {
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
// HIMARK email. acceptUrl is application-constructed today, not
// user-supplied, but this template is a reusable component and a future
// caller may not preserve that invariant.
function assertSafeUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`invitationTemplate: acceptUrl is not a valid absolute URL: ${value}`)
  }
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`invitationTemplate: acceptUrl has a disallowed protocol "${parsed.protocol}": ${value}`)
  }
  return value
}

export function invitationTemplate(data: {
  organizationName: string
  acceptUrl: string
  invitedBy: string
}): EmailTemplate {
  const acceptUrl = assertSafeUrl(data.acceptUrl)
  const organizationName = sanitizeLine(data.organizationName)
  const invitedBy = sanitizeLine(data.invitedBy)

  const org = escapeHtml(organizationName)
  const by = escapeHtml(invitedBy)
  const url = escapeHtml(acceptUrl)

  return {
    // Raw (unescaped) organization name is intentional: HTML-escaping a
    // subject would show recipients a literal "&amp;" instead of "&". Header
    // injection is prevented by sanitizeLine above, which strips CR/LF before
    // the value reaches here — and again by sanitizeHeaderValue in mime.ts
    // when the header is actually assembled. This used to rely on nodemailer's
    // mime-node doing it; since mail moved to the Graph API that protection is
    // ours, so it is now enforced at both ends rather than by a library.
    subject: `You have been invited to ${organizationName} on UNISON`,
    text: [
      `${invitedBy} has invited you to join ${organizationName} on UNISON.`,
      '',
      'Accept the invitation:',
      acceptUrl,
      '',
      'This link expires in 7 days. If you were not expecting it, you can ignore this email.',
    ].join('\n'),
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#16202e;line-height:1.6">
<p style="font-size:20px;font-weight:600;letter-spacing:.12em;margin:0 0 24px">UNISON</p>
<p>${by} has invited you to join <strong>${org}</strong> on UNISON.</p>
<p style="margin:32px 0"><a href="${url}" style="background:#16202e;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Accept invitation</a></p>
<p style="color:#6b7280;font-size:14px">This link expires in 7 days. If you were not expecting it, you can ignore this email.</p>
</body></html>`,
  }
}
