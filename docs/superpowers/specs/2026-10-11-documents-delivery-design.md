# Quotes and invoices: PDF, email and quote to invoice (Stage 2, slice B)

**Date:** 2026-10-11
**Status:** Awaiting review
**Origin:** Stage 2 of `docs/crm-roadmap.md`. Slice A (merged 2026-10-11) made quotes and invoices real documents with
lines, numbers, VAT and an on-screen printable sheet. Slice B delivers them: a PDF file, email to the client with a
record that it was sent, and an invoice made from an accepted quote. Payments, automatic Overdue and the forecast are
slice C.

## Intent

A salesperson sends a quote, downloads or emails its PDF to the client, and later turns the accepted quote into an
invoice without retyping anything. Success is that the PDF matches the HIMARK design and the on-screen sheet, that every
email sent is recorded and cannot be forged, and that an invoice made from a quote carries the same lines.

Decisions made with the user in design:

- **The email comes from the shared company mailbox** (`MAIL_FROM`, the one the invitation emails already use), with the
  signed-in member as Reply-To and named in the message. A member's own mailbox, or a sender per organisation, is a
  later change.
- **An invoice can be made only from an Accepted quote, copying every line.** A deposit is made by editing the draft's
  lines before issuing it. More than one invoice can be made from one quote.
- **Emailing is a small form with defaults:** one recipient (the client's billing email, else the primary contact's),
  an editable subject and message, the PDF attached, sent as many times as needed, each send recorded.
- **The PDF is made with `@react-pdf/renderer`, with `pdf-lib` (already installed) as the fallback** if the first task
  shows the library does not work on this stack.

## Scope

**In:** the PDF module and download route; the sent-emails table and its record function; `create_invoice_from_quote`;
new timeline kinds; attachments and Reply-To in the mail code; the email action, form and history; the Create invoice
button and list; tests, preview check, roadmap ticks.

**Out, and why:**

- **Delivery receipts.** Microsoft Graph accepts a message and reports nothing more; the history says what UNISON
  handed to the mail server, not that the client's mailbox accepted it.
- **CC, BCC, several recipients, attachments other than the document, scheduled or automatic sending.**
- **Percentage or milestone invoicing and tracking how much of a quote is billed.**
- **Payments, the invoice balance, automatic Overdue, the forecast** (slice C).
- **A stored copy of each PDF.** A sent or issued document is frozen, so its PDF is regenerated identically on demand;
  each email record stores a SHA-256 fingerprint of the exact bytes attached.
- **A PDF of a draft.** A draft keeps the on-screen preview and print; only a frozen document has a PDF.
- **CRM roles:** every active member can download, email and create invoices.

## Data

All new keys include `organization_id` (composite foreign keys), as elsewhere.

### `document_emails` (new)

One row per email handed to the mail server. Fields: `quote_id` or `invoice_id` (exactly one, composite foreign key,
`on delete cascade`), `to_address`, `subject`, `body`, `pdf_sha256` (64 hex characters), `pdf_bytes`, `sent_by`
(composite foreign key to `memberships`, `on delete set null (sent_by)`, as `activities.created_by`), `sent_at`.
Members read; **nobody but the record function writes**: `authenticated` has `select` only, no insert, update or
delete, so a "sent" record cannot be forged and cannot be edited afterwards. No audit trigger (the row is the log).

### `record_document_email(p_kind, p_id, p_to, p_subject, p_body, p_sha256, p_bytes) returns uuid` (new, definer)

`security definer`, `search_path = ''`, executable by `authenticated` only. It checks the caller is a member of the
document's organisation (reported as not found otherwise); that the document is **not a draft**; that `p_to` is one
syntactically valid address of at most 254 characters, `p_subject` is 1 to 300 characters, `p_body` at most 10,000, and
`p_sha256` is 64 hex characters. It inserts the row and writes the timeline entry: `quote.emailed` on the quote, or
`invoice.emailed` on the invoice's client (an invoice has no timeline of its own), with `details` holding the document
id and number. It returns the row id.

### `create_invoice_from_quote(p_quote_id) returns uuid` (new, definer)

`security definer`, own membership check, the quote's row locked. It refuses (with tokens) a quote that is not found,
archived or **not Accepted**. It creates a draft invoice with the quote's `client_id`, `client_name`, `owner_id`,
`opportunity_id`, `currency`, project name, description and reference, client reference and `quote_id`; copies every
line (position, title, description, quantity, unit price, VAT code, price list reference); leaves payment terms, the
issue date and the due date empty (they are filled when it is issued); and writes a `quote.invoiced` system entry on the
quote's timeline with the new invoice's id. The VAT rate, totals and draft reference come from the existing triggers.
The quote is not changed. Internal notes are not copied.

### New timeline kinds

`quote.emailed`, `invoice.emailed` and `quote.invoiced` are added to the `activities_kind_check` list (a new migration
replaces the constraint) and to the code's list and labels; the existing drift test keeps them equal.

## Behaviour

### PDF

- `features/documents/pdf/` turns a `DocumentView` (the same pure builder the on-screen sheet uses) into a PDF: A4, the
  same layout and the same content. Long documents wrap onto further pages with the table header repeated and the totals
  kept together. The layout is written with `createElement` (not JSX) so node's test runner can load and render it.
- Images come only from the checked `/brand/...` paths in the snapshot. The first task decides how they are read on
  Vercel (from disk with the files traced into the function, or fetched from the app's own origin) and proves it. The
  header photo must not push a PDF over **3 MB**; a lighter derivative is added if needed.
- A font covering South African names and addresses is embedded (an open-licence geometric sans, files committed).
  Text it cannot draw is replaced, never crashes the render.
- `GET /commercial/quotes/[quoteId]/document/pdf` and `GET /finance/invoices/[invoiceId]/document/pdf` check the caller
  is a signed-in member, return 404 for a malformed id, another organisation's document or a **draft**, and otherwise
  return `application/pdf` named `<number>.pdf`.

### Emailing

The `emailDocumentAction` server action: checks the kind and ids, that the document is sent or issued and belongs to the
caller's organisation, that the address is one valid address, and the cap of **50 document emails per organisation per
hour** (counted from `document_emails`; the cap guards against accidents and a runaway loop, the credentials never leave
the server). It builds the PDF, builds a multipart message (`mixed` with the text and HTML alternatives and the PDF)
with the member's address as Reply-To, and sends it through the existing Graph path. **Only after Graph accepts it** does
it call `record_document_email`. A refusal by the mail server shows a plain error and records nothing; a send that
succeeds but cannot be recorded says "Sent, but we couldn't record it." The existing `EMAIL_TRANSPORT=log` mode renders
and logs without sending, for local work and tests.

The default subject is `Quote <number> from <company>` or `Invoice <number> from <company>`; the default message is a
short plain-text note with the total, the company's closing text and the sender's name. The HTML part is the same text,
escaped, in paragraphs. Header values are stripped of line breaks.

### Create invoice

A **Create invoice** button on an Accepted quote calls `create_invoice_from_quote` and opens the new draft invoice. The
quote page lists the invoices made from it (a read of `invoices` where `quote_id` is the quote, subject to row level
security).

## Screens

- On a sent or issued document: **Download PDF** and **Email to client** beside View document; the email form (To,
  Subject, Message, Send) opens in the page and keeps what was typed after a failed send; an **Emails sent** list below
  the lines (when, to, subject, who sent it).
- On an Accepted quote: **Create invoice** and **Invoices made from this quote**.
- A draft shows none of these, with a note that it must be sent or issued first.

## Errors

Plain messages: "Enter one valid email address", "Send or issue this document before emailing it", "This organisation
has sent 50 document emails in the last hour; try again later", "The mail server refused the message", "Sent, but we
couldn't record it", "Only an accepted quote can be invoiced", "That quote was not found". A document from another
organisation is reported as not found. Nothing falls back to a default when a read fails.

## Testing

- **Database (RLS suite, fixture organisations, cleaned up including audit events; this is production):** a member
  cannot insert, update or delete `document_emails`; `record_document_email` refuses a non-member, a draft, a bad or
  second address, an over-long subject, a bad fingerprint and another organisation's document, writes the entry on the
  quote (or the client for an invoice), and the row cannot be altered afterwards; `create_invoice_from_quote` refuses a
  non-Accepted, archived, unknown or other-organisation quote, copies every line and detail, links `quote_id`, leaves
  the quote unchanged, writes `quote.invoiced`, and two calls make two invoices; `anon` has no access; the new activity
  kinds are accepted and the code's list equals the database check.
- **Unit:** PDF smoke tests (starts with `%PDF`, under 3 MB, long and hostile text, no company details, a long
  multi-page document); the mail builder with an attachment and a Reply-To, including header injection attempts; the
  email form reader and the default subject and message; source guards for the client and server boundary and for no
  real addresses in code.
- **Preview:** a generated PDF is compared with the supplied design; the email form and history at desktop and phone
  width.
- **Not covered by anything automated:** an email arriving in a real mailbox. A single real test email is sent to the
  user, with their say-so, at the end.

## Order of work

1. Prove `@react-pdf/renderer` builds and renders here and decide image loading (fallback: `pdf-lib`); the PDF module and
   the download routes.
2. Database: `document_emails`, `record_document_email`, `create_invoice_from_quote`, the new kinds, and their tests.
3. Mail: attachments and Reply-To, the email action and the cap.
4. Screens: email form and history, Create invoice and its list.
5. Preview check, follow-ups, roadmap ticks, the user's signed-in checklist.

## Global constraints

- `unison-uat` is production. Every test row is deleted, with its audit events; nothing real is emailed by a test.
  Rolled-back probes before applying any migration.
- Migrations are append-only. Decisions are made in the database and tested there; the UI mirrors them.
- A control in the UI is a claim the product supports it. No role-based behaviour is invented.
- No real address, bank, VAT or phone value in code or tests. Secrets live in `.env.local` only.
- Never `git add -A`; stage explicit paths. Commit and push only when the user asks.
