// The client-facing words of the quote portal and its email, kept in one place. Pure: no directive, no imports.
//
// Taken character for character from the spec appendix (docs/superpowers/specs/2026-10-18-quote-portal-design.md,
// "Appendix: client-facing copy"), with the spec's wrapped lines joined by one space. Plain ASCII, so the
// apostrophe in "we're" is the straight one. Nothing in the portal or the email writes these strings out by hand.

export const PORTAL_HEADING = 'Review your quotation'

export const PORTAL_INTRO =
  "Thank you for considering HIMARK as your strategic partner. Please review the details of your quotation below. If you have any questions, we're here to help."

export const READY_TO_RESPOND = 'Ready to respond?'

export const TERMS_STRIP = 'This quotation is subject to the terms and conditions below. Please review them carefully before responding.'

export const EMAIL_HEADING = 'Your quotation is ready for review'

export const EMAIL_DEFAULT_NOTE =
  'Thank you for considering HIMARK as your strategic partner. Your quotation is ready for review. Please review the details below and respond electronically using your secure quotation link.'

export const EMAIL_NEXT_STEPS = 'If you choose to proceed, our team will coordinate onboarding, project planning and activation of the agreed services.'

export const QUESTIONS_HEADING = 'Questions about this quotation?'

export const RECURRING_NOTE = 'Monthly charges recur each month; the first month is included in the total above.'

/** Slice 1 has no Accept or Decline buttons yet (slice 2 adds them), so the response panel says how to respond. */
export const SLICE_ONE_RESPOND_NOTE = 'To accept or decline this quotation, reply to the email you received or contact your HIMARK contact.'

// ---------------------------------------------------------------------------------------------------------------
// Words of the portal page that the spec appendix does not fix.
//
// The first group is read off the portal reference image (docs/superpowers/specs/assets/2026-10-18-quote-portal-
// reference-portal.webp) and the appendix's button names. The second group is DRAFTED for the owner's approval, like
// the other drafted copy in the spec appendix: the cards for an expired, replaced, unusable or unreachable link, and
// the short banners for a quote that has been decided. None of it has a placeholder: the number, the client and the
// dates are shown beside these sentences, not inside them, so no client text is ever spliced into a template.
// ---------------------------------------------------------------------------------------------------------------

export const PORTAL_SECURE_LABEL = 'Secure Quotation Portal'

export const SCOPE_HEADING = 'Scope of Services'

export const COMMERCIAL_HEADING = 'Commercial Summary'

export const TERMS_HEADING = 'Terms & Conditions'

export const DOWNLOAD_PDF = 'Download PDF'

export const EXPIRED_HEADING = 'This quotation has expired'

export const EXPIRED_SENTENCE = 'The validity period of this quotation has ended, so please get in touch and we will gladly prepare an updated one.'

export const SUPERSEDED_HEADING = 'This quotation has been replaced'

export const SUPERSEDED_SENTENCE = 'This quotation has been replaced by a newer version, so please get in touch to receive the latest one.'

export const INVALID_HEADING = 'This link is not valid'

export const INVALID_SENTENCE = 'The link may be incomplete or no longer active, so please check the email you received or contact your HIMARK contact.'

export const ERROR_HEADING = 'We could not load this quotation'

export const ERROR_SENTENCE = 'Something went wrong on our side, so please refresh this page in a moment or contact your HIMARK contact.'

/** The banner on an accepted quote. The date is the day it was accepted, in South African time, or null when it is not known. */
export function acceptedBanner(date: string | null): string {
  return date ? `This quotation was accepted on ${date}.` : 'This quotation has been accepted.'
}

/** The banner on a declined quote. The record keeps no decline date, so the date shown is the day the quotation was sent. */
export function declinedBanner(sentDate: string | null): string {
  return sentDate ? `This quotation has been declined. It was sent on ${sentDate}.` : 'This quotation has been declined.'
}
