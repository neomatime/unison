// The words of the HIMARK Welcome Email, kept in one place. Pure: no directive and no imports, so the template, the form and
// the unit tests all load it.
//
// The client-facing text is the owner's approved text, word for word (accept to invoice, stage 1: the first invoice of a billing
// plan goes out as this email, with the invoice and two approved documents attached). Plain ASCII, so every apostrophe and dash
// is the straight one. Nothing in the template or the actions writes these sentences out by hand; a change of wording is a
// change here, approved by the owner, and nowhere else.

export const WELCOME_EMAIL_SUBJECT = 'Welcome to HIMARK | Your Invoice & Next Steps'

/** The name in the greeting when the invoice has no contact name (owner-approved default). */
export const WELCOME_DEFAULT_NAME = 'Valued Client'

export const welcomeGreeting = (name: string): string => `Dear ${name},`

export const WELCOME_LINE = 'Welcome to HIMARK Strategic Growth Consulting.'

export const WELCOME_PARAGRAPHS = [
  'Thank you for choosing to partner with us. We are pleased to confirm that your quotation has been successfully accepted.',
  'We look forward to building a productive relationship centred around your business objectives and delivering meaningful results together.',
]

export const WELCOME_ATTACHED = 'To help you get started, we have attached the following documents:'

/** The numbered list: a bold title and one sentence each, in the order the three files are attached. */
export const WELCOME_DOCUMENT_LIST = [
  { title: 'Your Invoice', sentence: 'Your invoice reflecting the approved commercial arrangement and applicable payment terms.' },
  { title: 'Welcome Letter', sentence: 'A formal introduction to HIMARK, our values and what you can expect from our partnership.' },
  { title: 'Your Next Steps', sentence: 'A guide outlining the onboarding process and what happens before your engagement begins.' },
]

export const WELCOME_NEXT_HEADING = 'What happens next?'

export const WELCOME_NEXT_PARAGRAPHS = [
  'Our onboarding team will prepare your secure HiVE Room onboarding workspace.',
  'Once it is ready, a HIMARK team member will send you a separate invitation with instructions for completing your onboarding requirements.',
  'Throughout this process, our team will be available to assist you.',
  'We look forward to working together.',
]

export const WELCOME_SIGN_OFF = {
  closing: 'Warm regards,',
  name: 'The HIMARK Team',
  company: 'HIMARK Strategic Growth Consulting',
  tagline: 'Human First. Tools Second.',
}

// The brand bar and the images carry the same words as the quotation email's: the strapline on the navy bar and the alt text of
// the two pictures.
export const WELCOME_STRAPLINE = 'PEOPLE | STRATEGY | PROGRESS'
export const WELCOME_WORDMARK_ALT = 'HIMARK'

// The way forward in the refusal for a welcome email that is too large to send (welcome-documents.ts words the rest of it): the
// plain email's "Download it and send it yourself", adapted to the three files. features/documents/billing-plan-view.ts matches
// these words so that, after an approval, the sentence does not go on to say "Send it from the invoice page" for the very form
// that has just refused. One constant, so the two cannot drift apart.
export const WELCOME_TOO_LARGE_WAY_FORWARD =
  'Nothing was sent. Download the invoice PDF from the invoice page and send it yourself, together with the HIMARK Welcome Letter and HIMARK Your Next Steps. For future documents, a lighter header image under Settings, Company details keeps the PDF small enough to email.'

// What staff see on the Email to client form for this invoice (not sent to the client).
export const WELCOME_EMAIL_TITLE = 'HIMARK Welcome Email'
export const WELCOME_EMAIL_NOTE =
  'This invoice goes out as the HIMARK Welcome Email, with three attachments: the invoice, the HIMARK Welcome Letter and HIMARK Your Next Steps. The subject and the message are fixed. Replies go to your own email address.'
