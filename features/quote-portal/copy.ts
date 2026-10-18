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
