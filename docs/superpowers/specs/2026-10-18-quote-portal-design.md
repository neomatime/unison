# Quote portal: branded email, secure client link, electronic acceptance, HIVE feed gate

**Date:** 2026-10-18
**Status:** Draft for review (nothing built yet)
**Origin:** The owner's brief of 2026-10-18 ("Premium Quotation Email, Digital Quotation Portal & HIVE Integration"), with two
reference images, kept in this repo so the design can be checked against them:
`assets/2026-10-18-quote-portal-reference-email.webp` (the branded email) and
`assets/2026-10-18-quote-portal-reference-portal.webp` (the client-facing page). The wording the brief and images fix is in
the appendix. Built on Stage 2 (quotes as real documents, PDF and email delivery) and the HIVE boundary spec
(`2026-10-13-client-focused-boundary-design.md`). The figures, names and dates in the images are examples only; nothing in
them is hardcoded.

## Intent

A salesperson sends a quote. The client receives a premium, branded email, opens a private page showing exactly the quote that
was issued, and accepts or declines it there, without a UNISON account. UNISON records who decided, when, and on what wording,
moves the quote to Accepted or Declined, tells the owner, and, for a decline, gives them a sensible next step instead of an
automatic sales campaign. A client whose quote is accepted becomes visible to HIVE.

Success is that the whole journey works end to end on one real quote to the owner's own address, that no one can accept or
decline by merely having or opening a link, and that nothing is reported as done that is not.

## Decisions from the owner (2026-10-18)

1. **HIVE handoff is a gate on the existing client feed, not a push.** HIVE has no endpoint that receives anything from UNISON;
   it only pulls `GET /api/v1/clients`. That feed is changed so a client appears only while it has an Accepted quote.
2. **Quote lines get a structured charge kind** (once-off or monthly), so the portal can show the retainer and implementation
   split and the first-period total.
3. **Three slices, in this order:** (1) links, portal and email, (2) accept and decline, (3) HIVE feed gate.

## Scope

**In:** access links and their lifecycle; the portal (view, PDF download, states); the new quote email; `charge_kind`; the
emailed one-time code; accept and decline with an append-only decision record; status sync; owner notification and client
acknowledgement; the decline follow-up task; superseding a quote; nightly expiry; the staff "Client response" panel; the
feed gate; tests; docs.

**Out, and why:**

- **A push to HIVE, webhooks, an outbox, retries to HIVE.** HIVE has nothing to receive them. Nothing in this design may say a
  client was "handed off", only that the feed would include it.
- **Quote data in the HIVE feed.** The boundary spec says "nothing about quotes or invoices unless asked for later". The gate
  changes who appears, not what is sent.
- **Requiring a code just to view a quote.** It needs a signed session cookie and a new secret. Deferred; the link alone shows
  the quote, a code is required to decide.
- **A discount model, credit provisioning, onboarding, payments, project creation.** Accepting a quote is not onboarding.
- **An "advanced electronic signature" under ECTA.** What is built is acceptance by data message with an email-verified
  signatory. Whether that is enough for HIMARK's contracts is a question for their legal advisers before launch.
- **Delivery receipts, CC/BCC, scheduled sends** (already out in the delivery slice).

## What already exists (verified 2026-10-18)

- **Quote model.** `quotes` and `quote_lines`. `send_quote` freezes number, issuer, bill-to and terms; sent quotes are frozen
  for signed-in roles except status and notes. Totals and VAT are computed in the database. Statuses: Draft, Internal Review,
  Sent, Accepted, Declined, Expired. There is no Viewed or Superseded, no version link, no expiry job, and no recipient email
  on the quote. Any member can set Accepted or Declined by hand.
- **Email.** `sendEmail` over Microsoft Graph with attachments; the quote email is plain editable text wrapped in minimal
  HTML (`features/documents/email.ts`); every send is recorded in `document_emails` with the PDF's SHA-256. Sending is the
  `emailDocumentAction` server action, whose step order is pinned by `documents-actions-source.test.ts`.
- **PDF.** react-pdf, rendered per request from the frozen quote, never stored. Session-bound today.
- **Secure link precedent.** Invitations: sha256-hashed token, a page that renders on GET and acts only on POST, the path
  whitelisted in `proxy.ts` (`AUTH_EXEMPT`, pinned by tests).
- **Public routes** need `AUTH_EXEMPT` plus the tests that pin it. The service-role client may be imported only by files in
  `tests/unit/service-role-boundary.test.ts`, each with a written reason.
- **Follow-ups** are `tasks` (assignee is a team member; may attach to a lead, client or opportunity, not a quote). The
  timeline is `activities` (system kinds written by definer functions). In-app `notifications` can be inserted for another
  user only by a definer function.
- **The HIVE feed** is `get_clients_for_api_key`: every client of the key's organisation, filtered by `updated_at`, paged by
  id. Production today: 2 active clients, none with an Accepted quote, one live key, last read this morning.
- **Brand files** in `public/brand` are served without a session. The banner is 1.5 MB and the wordmark 2163 px wide, too
  heavy for an email.
- **The root layout renders Vercel Analytics on every route.**

## Slice 1: links, portal, email

### Data

New tables and columns, all by append-only migrations:

- **`quote_access_links`**: one row per link. Holds the sha256 hash of the token (never the token), the quote, the
  recipient email (lower-cased, fixed at creation) and optional name, who created it, `expires_at`, `revoked_at` with a
  reason, `first_viewed_at`, `last_viewed_at`. Members of the organisation may read their rows; nothing is written except
  through the functions below. Deleted with its quote or organisation.
- **`quotes.supersedes_quote_id`** (nullable, references `quotes`), and `Superseded` added to the status check.
- **`quote_lines.charge_kind`** (`once_off` or `monthly`, **nullable**). Existing lines stay null, so old quotes show a flat
  list rather than a wrong split.
- **`organization_settings.quote_portal_enabled`** (default false), and in slice 3
  **`organization_settings.hive_feed_requires_accepted_quote`** (default false).

### Link lifecycle

- **Creating.** `create_quote_access_link(quote, recipient email, recipient name)` is callable by a member of the quote's
  organisation. It requires the switch to be on and the quote to be Sent. It generates a 32-byte random token, stores its
  hash, and returns the raw token once, to the server action, which puts it in the email. The token cannot be shown again; a
  new send makes a new link. Several active links per quote are allowed (one per recipient). `expires_at` is the end of
  `valid_until` (South African time), or 30 days after creation when there is none.
- **Revoking.** A member can revoke a link from the quote page. Superseding a quote revokes all of its links.
- **Superseding.** "Revise this quote" makes a new draft with `supersedes_quote_id` set (a variant of the existing duplicate).
  The revision is a new quote with its own number, given when it is sent, as any quote is today. When it is sent, a database
  trigger moves the original to Superseded and revokes its links, but only if the original is still Sent. An Accepted,
  Declined or Expired original keeps its status and its record; the revision still points back to it.
- **Version.** There is no stored counter. A quote's version is 1 plus the number of quotes before it in the
  `supersedes_quote_id` chain, so the first quote is "Version 1" and a revision of it "Version 2". The portal and email show
  "Version 2, replacing HMK-Q-2026-00045". The evidence record stores the number and the version it was shown with.
- **Expiry.** The portal always checks `valid_until` itself. A nightly job (the same shape as `mark_overdue_invoices`) moves
  Sent quotes past `valid_until` to Expired and revokes their links.
- **Viewed.** A small client-side call after the page has loaded stamps `first_viewed_at`. Servers and mail scanners that do
  not run scripts do not count, so it is best effort and labelled "Opened", not "Read".

### Portal

- **Route** `/q/<token>` in its own route group with its own bare layout (no navigation, no staff UI), and `/q/<token>/pdf`.
  Added to `AUTH_EXEMPT`; the pinned tests are updated deliberately.
- **Data access.** Every read goes through functions granted to `service_role` only, called from one new allowlisted server
  module. Nothing is granted to `anon`, so the quote data cannot be reached by calling the database API directly with the
  public key. (This departs from the invitation precedent, which used `anon`-callable functions; that works for a preview but
  cannot protect a one-time code, see slice 2.)
- **One source of truth.** The portal page, the downloadable PDF and the emailed PDF are all rendered from the same frozen
  snapshot through `buildDocumentView`. The snapshot excludes internal notes, the owner and database ids.
- **Content**, following the reference image: introduction and assigned HIMARK contact; quote number, version, client,
  project, issue date, valid until, status, amount, currency, VAT treatment; scope and inclusions; commercial summary; terms
  and conditions exactly as frozen, with their template versions; response panel (Accept, Decline, Download PDF, Contact).
  Desktop shows the side panel, mobile a stacked layout. Nothing is invented: if a thing is not on the quote it is not shown.
- **Commercial summary.** When every line has a `charge_kind`: once-off lines, monthly lines with a per-month subtotal, VAT,
  and the total initial amount (the quote total, which already contains the first month of each monthly line), followed by
  "Monthly charges recur each month; the first month is included in the total above." Otherwise one flat list. Included
  credits appear only as the line descriptions already say ("Includes 40 credits a month"); credits are never a separate
  charge.
- **Client-facing status words:** Sent shows "Awaiting response"; the others keep their names.
- **States** each get a designed page: accepted, declined, expired, superseded, link not valid (unknown, revoked and malformed
  all look the same), and a temporary error.
- **Safety.** Opening or refreshing the page never changes the quote. Responses: `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, and a frame-ancestors restriction. The portal loads no
  third-party resources. Analytics must not receive the token: the Analytics component is wrapped so `/q/` URLs are redacted
  or the portal is excluded from it.
- **Charge kind on the staff side.** The line editor gets a once-off/monthly choice. The HIVE offering picker sets it
  (retainer and support kinds, or a monthly billing period, are monthly; everything else is once-off). The exact billing
  period strings are confirmed against the live feed during planning. `duplicate_quote` copies it. Invoices are unchanged.

### Email

- **A new template** (`lib/email/templates/quote.ts`), table-based, 600 px, inline styles, no scripts, with a plain-text
  alternative, built to the reference: logo, banner, heading "Your quotation is ready for review", a greeting using the
  contact's name when the quote has one, the sender's message, a summary card (quote number, project, amount with VAT
  treatment, valid until, status), a navy REVIEW QUOTATION button, an outline DOWNLOAD PDF button, the one-line "what happens
  next" note, and a footer with the sender's name, role where it exists, HIMARK Strategic Growth Consulting, website and
  contact details from the frozen company details.
- **Images** are absolute URLs on the app's public address. With images blocked, the header is a navy block with the company
  name in text, and every image has alt text.
- **The PDF stays attached.** The editable message field stays; its text becomes the personal note in the template. The
  default note is the brief's recommended wording.
- **The send action** mints the link after validation and before sending, revokes it if the send fails, and still records the
  send as today. Its pinned step-order test is updated on purpose.

### Rollout

With `quote_portal_enabled` off, the email and the action behave exactly as they do today. The switch is on the company
settings page (owner and admin). It is removed in a later change once the owner is satisfied.

## Slice 2: accept and decline

### The decision flow

1. The client presses Accept or Decline. A confirmation step shows the quote number and version, organisation, services,
   initial total, recurring commitments and key terms.
2. They enter full name, position and organisation (prefilled from the quote, editable), tick the unchecked consent box, and
   press "Email me a code". The verified email is the link's recipient and cannot be edited.
3. A six-digit code goes to that address. They enter it and confirm. The decision is a single POST carrying the token, the code,
   the form fields, the exact consent wording shown, and the hash of the snapshot they were shown.
4. Declining asks for an optional reason (Budget considerations, Timing is not right, Scope does not meet our requirements,
   Internal approval pending, Chose another provider, Other) and optional comments, and needs the code too, so a forwarded
   link cannot decline for the client.
5. The consent wording is: "I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept
   this quotation and its accompanying terms and conditions." Decline has its own, shorter, confirmation.

### Server rules

One database function, callable only by the service role, does everything in one transaction. It locks the quote row, then
refuses unless: the link is valid and unexpired and unrevoked; the quote is Sent; no final decision exists; the code is the
current one, unexpired and not over its attempt cap; the submitted snapshot hash matches the recomputed one; all required
fields and the consent are present. On success it writes the response, sets the status, and creates the follow-ups below.
A repeated request for an already-decided link returns the recorded outcome and writes nothing.

- **Which state is authoritative.** The quote's status is. The portal's state page is chosen from `quotes.status` and, for an
  Accepted or Declined quote, shows the date and, when this link made the decision, its recorded outcome.
- **Reopening.** If staff move a decided quote back to Sent, any still-valid link that has not yet been used may decide it
  again, and a new response row is appended; earlier rows are never changed. A link that already carries a decision stays used,
  so after a reopen staff issue a fresh link to the person who should decide. "No final decision exists" is checked against the
  quote's status, "one decision per link" against the link, and both apply.

- **Codes** are stored salted and hashed, expire after 10 minutes, allow 5 attempts, and are limited to 5 requests per link
  per hour. Failed verification attempts per link are also capped per hour. The limiter is a count in the database; there is no
  per-address limiter in this version.
- **`quote_responses`** is append-only: no update, no delete for any role, including the service role (a trigger refuses both),
  except that rows go when their organisation or quote is deleted, so test fixtures can be removed. It stores: quote, link,
  decision, server time, signatory name, position and organisation, the verified email, the exact consent wording and flag,
  when the code was verified, the snapshot hash, the terms sources, quote number and version, IP address and user agent (the
  evidence the owner asked for, kept to that minimum), and for declines the reason and comments. One decision per link.
- **Status.** Accepted or Declined is set in the same transaction. Staff can still set Accepted or Declined by hand (a phone
  acceptance); the staff panel shows such a quote as "Marked by staff" because it has no response record.
- **Timeline.** The existing trigger writes `quote.accepted`; new kinds `quote.declined` and `quote.superseded` are added to the
  activity vocabulary and its pinned test. Whether the existing trigger works with no signed-in user is verified in a
  rolled-back probe before the plan relies on it.

### After a decision

- **The owner is told**, in the app (a definer function inserts a notification for the quote's owner when the owner has a
  login, and for the member who sent the link) and by email after the decision has committed. A failed email does not undo the
  decision.
- **The client gets an acknowledgement** by email, best effort, after commit.
- **Decline recovery.** A follow-up task is created for the quote's owner (the sender if there is no owner), attached to the
  opportunity when the quote has one, otherwise to the client, with the saved reason and a recommended action. The quote stays
  Declined; the opportunity and its stage are not touched; nothing is sent to the client.

| Reason | Recommended action in the task |
|---|---|
| Budget considerations | Review whether a smaller, clearly scoped engagement could meet their most important need. Do not discount automatically. |
| Timing is not right | Offer to reconnect on a date the client chooses. |
| Scope does not meet our requirements | Offer a discovery conversation and a revised quotation if the need can be met. |
| Internal approval pending | Offer a concise business case, supporting documents or an executive conversation. |
| Chose another provider | No task. A timeline note: thank them and close the opportunity respectfully, no repeated contact. |
| Other, or none given | One courteous, optional follow-up if it suits the relationship. |

### Staff panel on the quote page

Links (recipient, issued, expires, opened, state, Revoke), the response (signatory, position, organisation, verified email,
time, terms version, snapshot hash), decline reason and comments, the supersede chain, and "Revise this quote".

## Slice 3: HIVE feed gate

- **Held behind its own setting.** A new `organization_settings.hive_feed_requires_accepted_quote` (default false) controls the
  rule. Shipping the migration changes nothing for HIVE. The owner turns it on after HIVE's maintainers have been told. While it
  is off, the feed behaves exactly as it does today.
- **Rule when on.** `get_clients_for_api_key` returns a client only while the organisation has at least one non-archived quote
  for it with status Accepted, by either path (portal or staff). Nothing else about the response changes.
- **Incremental pulls.** The `updated_since` filter and the returned `updatedAt` use the later of the client's own
  `updated_at` and its latest `accepted_at`, so a client that becomes eligible after HIVE's last pull is not skipped. Without
  this, an acceptance would never reach a HIVE that pulls by `updated_since`.
- **Reverting.** If an Accepted quote is moved back by staff, the client leaves the feed. UNISON cannot make HIVE forget a
  client it has already read; whether HIVE removes a client that disappears from the feed is HIVE's behaviour, which this repo
  does not show.
- **Staff view.** With the setting on, the quote page says "Included in the HIVE client feed since <date>" or "Not included
  (no accepted quote)", with the time HIVE last read the feed. With it off, it says the feed currently includes every client.
  Nothing shows "completed" or "handed off": UNISON cannot see what HIVE did with it.
  This replaces the brief's Pending, In Progress, Completed, Failed and Requires Attention states, which assume a push.
- **Contract change.** Turned on, this narrows a live contract. The boundary spec and the feed documentation are updated in
  this slice, and the setting stays off until HIVE's maintainers have been told.

## Security, evidence and legal

- Tokens are 256-bit random values, stored only as hashes, revocable, expiring, and bound to a recipient address. A link alone
  can only view. Scanners and prefetchers cannot decide anything: they do not have the code and the page changes nothing on GET.
- The raw token appears in the emailed URL and therefore in platform request logs. That is an accepted limit; it is why a
  leaked link can expose only a view of that one quote and never a decision.
- The service role is used by exactly one new module, listed in the service-role boundary test with its reason. The portal
  functions are granted to nothing else.
- No new environment variables.
- Row-level security tests for every new table, and the anonymous-privileges test updated for them.
- **Legal and privacy review is required before launch** and is not something the code can settle: whether click-to-accept with
  an emailed code satisfies ECTA and HIMARK's contracts, what the evidence record may keep under POPIA, and how long. Until then
  nothing is retained or deleted automatically.

## Testing, and what cannot be verified

- **Unit tests** for the email template (structure, no scripts, escaping, links, plain text), token and code helpers, charge
  kind mapping, the commercial summary grouping, decline recommendations, client-facing status words, and source tests for the
  actions.
- **Database tests** against fixture organisations (production is the only database, so every fixture and its audit rows are
  swept and checked afterwards): access, expiry, revocation, supersede, one decision per link, duplicate and conflicting
  decisions, decline after accept, append-only enforcement, code limits, snapshot mismatch, the feed gate and its
  incremental behaviour, and RLS on every new table.
- **Browser check** of the portal at desktop and phone width with a fixture quote that is removed afterwards.
- **Cannot be verified from here:** rendering in Outlook and Gmail, and the real mail path. The owner sends one real quote to
  their own address with the switch on; until then email rendering is reported as unverified.

## Calls I made (for review)

1. The portal reads and writes only through service-role-only functions, not anon-callable ones (changes what I said earlier).
2. A code is needed to decline as well as accept.
3. The signatory's email is the link's recipient and cannot be changed; a colleague who is not the recipient must ask for a
   new link sent to them.
4. Several active links per quote, one per recipient; the first decision closes the quote for all of them.
5. `Superseded` is a new status; "viewed" is a timestamp on the link, not a status; no Pending Approval or Approved.
6. A nightly job expires Sent quotes past `valid_until`. Production currently has none past validity.
7. The decision stores IP address and user agent. This is the minimum evidence I could justify; the owner may drop it.
8. The code-to-view gate is deferred (see Scope).
9. Nothing about the staff Accepted/Declined buttons is restricted.
10. "Chose another provider" creates no task, per the brief.
11. The HIVE feed rule ships dormant behind its own setting, so deploying it cannot change what HIVE reads.
12. Version is the position in the supersede chain; a revision gets its own quote number.
13. Only a Sent quote is moved to Superseded by its revision; decided and expired originals keep their status.
14. The reference's inline "I have reviewed this quotation" tick-box on the response panel is not kept: the one consent
    tick-box is in the confirmation step, with the brief's wording, unchecked by default.
15. The reference's sentence listing "confidentiality, intellectual property" among the terms is replaced by a neutral one
    (see the appendix), because the frozen terms may not cover those items and the portal must not claim what the terms do not
    say. The reference's "our team will coordinate onboarding" note is kept as drawn.
16. All client-facing copy not fixed by the brief or images (the code email, the acknowledgement, the owner notification) is
    drafted in the appendix and marked for the owner's approval.

## Left to the builder

Function signatures and table definitions; migration timestamps; the shape of the snapshot JSON and its canonical hashing;
the component structure and the exact visual treatment from the reference images; the nightly job's schedule; the Analytics
wrapper; where the owner's contact details come from when a team member has none; test file layout.

## Needs the owner

1. **Email images.** The existing banner (1.5 MB) and wordmark (2163 px) are too heavy for an email. May I add two small
   files derived from them to `public/brand` (a wordmark about 480 px wide and a banner about 1200 px wide, 150 KB or less),
   or will you supply them? I will not touch `public/` otherwise.
2. **HIVE's side of the gate.** HIVE reads the feed live (last read this morning). The rule ships off. When it is switched on,
   the two current clients, neither with an accepted quote, stop appearing in new pulls. Who tells the HIVE team, and when do
   you want it switched on? (Until you say, it stays off.)

## Appendix: client-facing copy

Fixed by the brief or the reference images (used as written, with the client's own details filled in):

- Email heading: "Your quotation is ready for review".
- Email message (default note): "Thank you for considering HIMARK as your strategic partner. Your quotation is ready for
  review. Please review the details below and respond electronically using your secure quotation link."
- Email buttons: "REVIEW QUOTATION", "DOWNLOAD PDF". Email note: "If you choose to proceed, our team will coordinate
  onboarding, project planning and activation of the agreed services."
- Portal heading: "Review your quotation". Portal introduction: "Thank you for considering HIMARK as your strategic partner.
  Please review the details of your quotation below. If you have any questions, we're here to help."
- Response panel: "Ready to respond?", buttons "Accept Quotation", "Decline Quotation", "Download PDF"; help panel "Questions
  about this quotation?" with the owner's name, "HIMARK Strategic Growth Consulting" and the website.
- Consent (unchecked by default): "I confirm that I am authorised to act on behalf of the organisation and have reviewed and
  accept this quotation and its accompanying terms and conditions."
- Decline: "We understand that the quotation may not be the right fit at this time. Thank you for considering HIMARK."

Drafted by me, for the owner's approval (not in the brief or images):

- Terms strip on the portal: "This quotation is subject to the terms and conditions below. Please review them carefully
  before responding."
- Code email, subject "Your HIMARK confirmation code": "Your confirmation code is 123456. It expires in 10 minutes. If you did
  not ask for this code, you can ignore this email; nothing has been accepted or declined."
- Client acknowledgement (accepted): "Thank you. We have recorded your acceptance of quotation {number} on {date}. Your
  HIMARK contact, {owner}, will be in touch about next steps." (declined): "Thank you for letting us know. We have recorded
  your response to quotation {number}."
- Owner notification: "{client} {accepted|declined} quotation {number}" with the signatory's name and, for a decline, the reason.
