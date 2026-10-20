// The client-facing words of the quote portal and its email, kept in one place. Pure: no directive, and no import but a type.
//
// Taken character for character from the spec appendix (docs/superpowers/specs/2026-10-18-quote-portal-design.md,
// "Appendix: client-facing copy"), with the spec's wrapped lines joined by one space. Plain ASCII, so the
// apostrophe in "we're" is the straight one. Nothing in the portal or the email writes these strings out by hand.
import type { DecisionKind } from '../../lib/quote-portal/types.ts'

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

export const EXPIRED_SENTENCE = 'This quotation is no longer open for response. Please get in touch if you would like an updated one.'

export const SUPERSEDED_HEADING = 'This quotation has been replaced'

export const SUPERSEDED_SENTENCE =
  'A newer version of this quotation has been issued. Please use the link in the most recent email you received from HIMARK, or get in touch.'

export const INVALID_HEADING = 'This link is not valid'

export const INVALID_SENTENCE = 'The link may be incomplete or no longer active, so please check the email you received or contact your HIMARK contact.'

export const ERROR_HEADING = 'We could not load this quotation'

export const ERROR_SENTENCE = 'Something went wrong on our side, so please refresh this page in a moment or contact your HIMARK contact.'

/** The banner on an accepted quote. The date is the day it was accepted, in South African time, or null when it is not known. */
export function acceptedBanner(date: string | null): string {
  return date ? `This quotation was accepted on ${date}.` : 'This quotation has been accepted.'
}

/** The banner on a declined quote. The record keeps no decline date, so it states the fact and no date. */
export const DECLINED_BANNER = 'This quotation has been declined.'

/** The label of the retry button on the portal's error page. */
export const RETRY_LABEL = 'Try again'

/** What the client is told when the PDF cannot be made or the quotation cannot be read for it: nothing of why. */
export const PDF_FAILED_MESSAGE = 'The PDF could not be prepared. Please try again, or get in touch.'

// ---------------------------------------------------------------------------------------------------------------
// Slice 2: accepting and declining.
//
// The first group is taken character for character from the spec appendix (the same document as above), with the
// spec's wrapped lines joined by one space. A unit test (tests/unit/quote-portal-decision.test.ts) reads the spec and
// compares these by value, so the two cannot drift apart. The appendix writes {number}, {date}, {owner} and {client}
// for the client's own details: the functions below put them in, and callers pass plain text (the email templates
// escape it for HTML and strip line breaks from anything that reaches a subject).
// ---------------------------------------------------------------------------------------------------------------

export const ACCEPT_QUOTATION = 'Accept Quotation'

export const DECLINE_QUOTATION = 'Decline Quotation'

/** The consent wording of an accept. The box beside it is unchecked by default. The decision is refused unless it is sent back word for word. */
export const CONSENT_ACCEPT =
  'I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions.'

/** Shown under the banner of a quote this link declined. */
export const DECLINE_MESSAGE = 'We understand that the quotation may not be the right fit at this time. Thank you for considering HIMARK.'

export const CODE_EMAIL_SUBJECT = 'Your HIMARK confirmation code'

/** The sentence of the confirmation code email. The code is six digits; the 10 minutes are the database's expiry. */
export function codeEmailSentence(code: string): string {
  return `Your confirmation code is ${code}. It expires in 10 minutes. If you did not ask for this code, you can ignore this email; nothing has been accepted or declined.`
}

/**
 * The client's acknowledgement of an acceptance. `date` is already written for reading (the caller formats it).
 * A quote with no owner has no name to give, so the sentence loses ", {owner},": that variant is DRAFTED for the owner's
 * approval, since the appendix always has an owner.
 */
export function acknowledgementAccepted(number: string, date: string, owner: string | null): string {
  const contact = owner ? `Your HIMARK contact, ${owner}, will be in touch about next steps.` : 'Your HIMARK contact will be in touch about next steps.'
  return `Thank you. We have recorded your acceptance of quotation ${number} on ${date}. ${contact}`
}

/** The client's acknowledgement of a decline. */
export function acknowledgementDeclined(number: string): string {
  return `Thank you for letting us know. We have recorded your response to quotation ${number}.`
}

/** The title of the owner's notice, in the app and as the email subject: "{client} accepted quotation {number}". */
export function ownerNoticeTitle(client: string, decision: DecisionKind, number: string): string {
  return `${client} ${decision} quotation ${number}`
}

// ---------------------------------------------------------------------------------------------------------------
// DRAFTED for the owner's approval: the words the appendix does not give. Like the drafted copy above, none of it
// is final until the owner has seen it. Plain ASCII. Nothing here has a placeholder for client text except the four
// functions straight below (the client emails' subject, greeting and reference lines), which put the quotation number,
// the client or the signatory's name in, and codeSentMessage, which puts in the masked address the code went to;
// callers pass plain text, the page prints it as a text node, and the email templates escape it for HTML and strip
// line breaks from anything that reaches a subject. The other numbers in this section are the count of attempts left
// and the minutes a code lasts.
// ---------------------------------------------------------------------------------------------------------------

/** The subject of the client's acknowledgement. The appendix gives the sentence of that email, not its subject. */
export function acknowledgementSubject(number: string): string {
  return `Your response to quotation ${number}`
}

/** The greeting of the client's acknowledgement: the signatory's name, or the bare greeting when there is none. */
export function acknowledgementGreeting(name: string | null): string {
  return name ? `Hello ${name},` : 'Hello,'
}

/** The first reference line under the confirmation code, so the client can tell which quotation the code is for. */
export function codeEmailQuoteLine(number: string): string {
  return `Quote number: ${number}`
}

/** The second reference line under the confirmation code; left out when the client's name is not known. */
export function codeEmailClientLine(client: string): string {
  return `Client: ${client}`
}

/** The consent wording of a decline: the appendix says only that decline has "its own, shorter, confirmation". */
export const CONSENT_DECLINE = 'I confirm that I am authorised to decline this quotation on behalf of the organisation.'

/** The headings of the steps after Accept or Decline is pressed. Focus moves to the heading of each step. */
export const STEP_LABELS = {
  confirmAccept: 'Confirm your acceptance',
  confirmDecline: 'Confirm your decision to decline',
  code: 'Enter your confirmation code',
} as const

/** Shown instead of the Accept and Decline buttons when this link has already responded (a reopened quote). */
export const ALREADY_RESPONDED_NOTE =
  'A response has already been recorded using this link. If the quotation needs a new response, please ask your HIMARK contact for a new link.'

/** The labels of the summary at the top of the confirm step: what the client is accepting or declining. */
export const CONFIRMATION_LABELS = {
  quotation: 'Quotation',
  organisation: 'Organisation',
  services: 'Services',
  initialTotal: 'Initial total',
  recurring: 'Recurring commitments',
  keyTerms: 'Key terms',
} as const

/** The labels of the decision form's fields. The email is shown, never typed: it is where the code is sent. */
export const FORM_LABELS = {
  name: 'Full name',
  position: 'Position',
  organisation: 'Organisation',
  email: 'Verified email',
  reason: 'Reason for declining',
  noReason: 'Choose a reason (optional)',
  comments: 'Comments (optional)',
  code: 'Confirmation code',
} as const

/** The buttons of the steps after Accept or Decline. "Email me a code" is the spec's own wording (its decision flow, step 2). */
export const FLOW_BUTTONS = {
  emailCode: 'Email me a code',
  sending: 'Sending...',
  confirm: 'Confirm',
  confirming: 'Confirming...',
  newCode: 'Send a new code',
  back: 'Back',
} as const

/** Where the code went, once it has been sent: the address is the masked one (j***@acme.co.za), the minutes the database's expiry. */
export function codeSentMessage(maskedEmail: string, minutes: number): string {
  return `We have emailed a six-digit code to ${maskedEmail}. It expires in ${minutes} minutes.`
}

/** Shown for the moment between a recorded decision and the refreshed page that shows it. */
export const DECISION_RECORDED = 'Thank you. Your response has been recorded.'

/** What the client is told when a field of the decision form is not valid. One message per field; none repeats what was typed. */
export const FIELD_ERRORS = {
  token: 'This link is not valid. Please check the email you received or contact your HIMARK contact.',
  decision: 'Please choose Accept Quotation or Decline Quotation.',
  name: 'Please enter your full name, on one line, in 2 to 120 characters.',
  position: 'Please enter your position, on one line, in 2 to 120 characters.',
  organisation: 'Please enter the organisation, on one line, in 2 to 160 characters.',
  consent: 'Please tick the box to confirm.',
  reason: 'Please choose one of the listed reasons, or leave it blank.',
  comments: 'Please keep your comments to 2000 characters of plain text.',
  code: 'Please enter the six-digit code from your email.',
  snapshot: 'This page is out of date. Please refresh it and try again.',
} as const

/**
 * What the client is told when a code request or a decision is refused, one message per reason (the reasons of the two
 * functions share names, so one table serves both). Each says what to do next and none says how the check works.
 * A wrong code has its own function below, because it carries the attempts left.
 */
export const REFUSAL_MESSAGES = {
  invalid: 'We could not match this link to a quotation. Please check the email you received or contact your HIMARK contact.',
  not_open: 'This quotation is no longer open for a response. Please refresh the page to see where it stands.',
  incomplete: 'Some of your details are missing or not valid. Please check the form and try again.',
  stale: 'This quotation has changed since you opened this page. Please refresh the page and review it again before you respond.',
  code_missing: 'There is no active confirmation code for this link. Please request a new code.',
  code_expired: 'That code has expired. Please request a new code.',
  code_locked: 'Too many incorrect attempts were made with that code. Please request a new code.',
  throttled: 'There have been too many attempts for now. Please wait a while and try again, or contact your HIMARK contact.',
  already_decided: 'A response has already been recorded for this quotation, so no code is needed. Please refresh the page.',
  send_failed: 'We could not send your confirmation code just now. Please try again in a moment.',
} as const

/** The message for a wrong code. A count that is not a whole number of zero or more is not shown. */
export function codeWrongMessage(attemptsLeft?: number): string {
  if (typeof attemptsLeft !== 'number' || !Number.isInteger(attemptsLeft) || attemptsLeft < 0) {
    return 'That code is not correct. Please check it and try again.'
  }
  if (attemptsLeft === 0) return 'That code is not correct, and you have no attempts left. Please request a new code.'
  return `That code is not correct. You have ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`
}

/** For a reason this build does not know (a database that has moved on): a message that is true of any failure. */
export const REFUSAL_FALLBACK = 'Something went wrong on our side. Please try again in a moment, or contact your HIMARK contact.'
