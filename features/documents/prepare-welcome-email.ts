import 'server-only'

import type { DocumentBundle } from './queries/get-document'
import { isWelcomeInvoice } from './queries/is-welcome-invoice'
import { buildWelcomeEmail, readWelcomeAddress, type PreparedWelcomeEmail } from './welcome-email'
import { loadWelcomeDocuments, welcomeDocumentsFailure, welcomeDocumentsProblem } from './welcome-documents'

/**
 * The HIMARK Welcome Email for the email action (features/documents/actions/email.ts), which calls this for every invoice after its
 * checks and before its one send. Returns null for any invoice that is not the first invoice of a billing plan: the action then
 * sends the plain email exactly as before.
 *
 * WHAT THIS FILE PROMISES
 * - Nothing is sent from here, and nothing is recorded. Anything that fails returns an error in plain words and the action sends
 *   nothing: a plan that cannot be checked, a document that cannot be read (missing, empty, not a PDF), an app address that is
 *   missing or unusable, an attachment total over the cap.
 * - The plan is asked through the one welcome rule (queries/is-welcome-invoice.ts), the same one the email form's defaults ask.
 * - The two documents are read from public/brand/documents (welcome-documents.ts) before anything is built.
 * - This module, not the action, reads the environment (the app's public address, which the email's pictures load from).
 */
export async function prepareWelcomeEmail(input: {
  invoiceId: string
  bundle: DocumentBundle
  /** The invoice PDF the action already made, under the name it has today. */
  invoice: { filename: string; bytes: Uint8Array }
}): Promise<PreparedWelcomeEmail | { error: string } | null> {
  let welcome: boolean
  try {
    welcome = await isWelcomeInvoice('invoice', input.invoiceId)
  } catch (error) {
    console.error('[documents:welcome:plan]', error)
    return { error: 'The billing plan of this invoice could not be checked, so nothing was sent. Please try again.' }
  }
  if (!welcome) return null

  let documents: Awaited<ReturnType<typeof loadWelcomeDocuments>>
  try {
    documents = await loadWelcomeDocuments()
  } catch (error) {
    console.error('[documents:welcome:documents]', error)
    return { error: `${welcomeDocumentsFailure(error)} Nothing was sent.` }
  }

  const address = readWelcomeAddress(process.env)
  if ('problem' in address) return { error: `${address.problem} Nothing was sent.` }

  const built = buildWelcomeEmail({
    contactName: input.bundle.record.contact_name,
    documents,
    appUrl: address.appUrl,
    invoice: input.invoice,
  })
  return built
}

/**
 * The approval's pre-flight: everything the Welcome Email needs that is not about one invoice, checked before the invoice is numbered
 * (an approval is final, so one that could only fail at the send would leave an issued invoice that has not gone out). The two
 * documents are read, then the app address is checked with the template's own rule. Null when ready, otherwise plain words saying
 * what is wrong. Reads, sends nothing.
 */
export async function welcomeEmailProblem(): Promise<string | null> {
  const documents = await welcomeDocumentsProblem()
  if (documents) return documents
  const address = readWelcomeAddress(process.env)
  return 'problem' in address ? address.problem : null
}
