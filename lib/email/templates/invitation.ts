export type EmailTemplate = { subject: string; html: string; text: string }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!
  ))
}

export function invitationTemplate(data: {
  organizationName: string
  acceptUrl: string
  invitedBy: string
}): EmailTemplate {
  const org = escapeHtml(data.organizationName)
  const by = escapeHtml(data.invitedBy)
  const url = escapeHtml(data.acceptUrl)

  return {
    subject: `You have been invited to ${data.organizationName} on UNISON`,
    text: [
      `${data.invitedBy} has invited you to join ${data.organizationName} on UNISON.`,
      '',
      'Accept the invitation:',
      data.acceptUrl,
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
