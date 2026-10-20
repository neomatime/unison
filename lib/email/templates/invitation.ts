import { assertSafeUrl, escapeHtml, sanitizeLine } from './safe.ts'

export type EmailTemplate = { subject: string; html: string; text: string }

export function invitationTemplate(data: {
  organizationName: string
  acceptUrl: string
  invitedBy: string
}): EmailTemplate {
  const acceptUrl = assertSafeUrl(data.acceptUrl, 'invitationTemplate: acceptUrl')
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
