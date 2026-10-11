import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { getDocument } from '../queries/get-document'
import { getEmailDefaults } from '../queries/get-email-defaults'
import { listDocumentEmails } from '../queries/list-document-emails'
import { isDraftStatus, type DocumentKind } from '../vocabulary'
import { EmailDocumentForm } from './email-document-form'

const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })

/** Email the document to the client, and the list of what has been sent. A draft has neither: it must go out first. */
export async function EmailSection({ kind, id }: { kind: DocumentKind; id: string }) {
  const bundle = await getDocument(kind, id)
  if (!bundle) return null
  const draft = isDraftStatus(kind, bundle.record.status)
  const [defaults, sent] = draft ? [null, []] : await Promise.all([getEmailDefaults(kind, bundle), listDocumentEmails(kind, id)])
  return (
    <div id="email-client" className="scroll-mt-24">
      <WorkspaceSection title="Email to client" description="Sends the PDF from the company mailbox. Every email sent is recorded below.">
        {draft || !defaults ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Send or issue this document before emailing it.</p>
        ) : (
          <>
            <EmailDocumentForm kind={kind} id={id} defaults={defaults} />
            <div className="border-t border-border">
              <h3 className="px-5 pt-4 text-sm font-semibold text-foreground">Emails sent</h3>
              {sent.length ? (
                <ul className="divide-y divide-border">
                  {sent.map((email) => (
                    <li key={email.id} className="px-5 py-3 text-sm">
                      <p className="text-foreground">{email.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">To {email.to} · {email.sentBy} · {WHEN.format(new Date(email.sentAt))}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-muted-foreground">Nothing has been emailed yet.</p>
              )}
            </div>
          </>
        )}
      </WorkspaceSection>
    </div>
  )
}
