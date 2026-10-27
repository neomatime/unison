# From acceptance to invoice to payment

**Date:** 2026-10-26
**Status:** Stage 1 built (2026-10-27); Stages 2 to 4 not started
**Origin:** The owner's brief of 2026-10-26 ("when a client securely accepts a quotation ... generate and email the invoice ...
track payment"), refined in conversation the same day. It completes the quote portal (slices 1 to 3 are built and live; see
`docs/superpowers/specs/2026-10-18-quote-portal-design.md`). It **amends** the boundary decision of 2026-10-13
(`2026-10-13-client-focused-boundary-design.md`): UNISON now issues the monthly invoices of an accepted quote, which that
document had left to HIVE. HIVE still owns delivery and does not receive invoices.

## Intent

When a client accepts a quotation on the portal, the paperwork that follows should happen without anyone retyping it, and
without anyone losing sight of the money. The client should feel looked after: a prompt, correct invoice, a clear way to pay,
and a friendly nudge if they forget. The owner should stay in control of the two things that carry real risk: the first
invoice (they approve it) and anything that fails its checks (it waits for a person).

"Premium. Personal. Secure. Human First. Tools Second." (the brief for the portal) still applies: the system does the
repetitive work, people make the judgement calls.

## What the owner decided (2026-10-26)

1. **The monthly invoices are issued by UNISON,** not HIVE.
2. **A quote with a monthly charge carries a start date and a term** (a number of months, for example 12 or 24), set by staff on
   each quote before it is sent. Billing for the monthly charge follows the start date.
3. **The first invoice goes out as soon as the client accepts,** even if the start date is later. It covers the once-off fees plus
   the first month, which is the "initial total" the client already sees on the portal.
4. **The term is fixed.** When it ends, billing stops. A renewal is a new quote with its own start date and term.
5. **The first invoice is held for the owner's approval.** UNISON prepares it as a draft and tells the owner; the owner approves
   and sends it with one button. **The monthly invoices go out automatically,** but only once the first invoice has been
   approved and sent.
6. **Payment is by bank transfer for now.** A person records the payment when the money appears on the bank statement. Online
   payment is a later project.
7. **Reminders are automatic:** a friendly reminder 3 days after the due date, then weekly, stopping after four weekly
   reminders. After that the owner follows up personally.
8. **Starting the work:** preparation starts at acceptance (an onboarding record and a task for the owner). The work itself
   starts on the **later of the start date and the first invoice being paid**, and the owner can override that quote by quote.
   Nothing is pushed to HIVE.
9. **Deposits, instalments and milestone billing come in a later round.** The first version is the first invoice plus the
   monthly schedule, built so those can be added without redoing it.
10. **Nothing is marked paid because it was emailed.** Only a recorded payment changes an invoice to Paid or Partially paid.
11. **Monthly invoices do not wait for the first invoice to be paid,** only for it to be approved and sent. Billing follows the
    agreement; whether the work has started is the readiness rule's job, and staff can pause a plan.
12. **A Won Sales record is valued at the whole agreement, excluding VAT:** the once-off fees plus the monthly charge times the
    term. It is written only when the opportunity has no value yet, so a value staff typed is never overwritten.

## Goals

- An accepted quote (accepted on the portal) produces, without retyping, a Sales record marked Won, a billing plan, and a draft
  first invoice, and tells the right person.
- The first invoice is approved by a person, then issued and emailed with the PDF, bank details and a payment reference.
- Each later month produces exactly one invoice, issued and emailed automatically on its date.
- Overdue invoices get the agreed reminders and then a human follow-up.
- Every step is recorded (who, when, what was sent) and every number on every invoice comes from the accepted quote.
- Nothing can create two invoices for the same month, or two first invoices for a quote, however many times a button is
  pressed or a job runs.

## Non-goals (this project)

- Online payment, a payment gateway, or payment confirmation by a provider (later; bank transfer only for now).
- Deposits, instalments and milestone billing (later round).
- Credit notes, refunds, write-offs, cancelling and reissuing issued invoices (stay manual).
- Importing bank statements or matching payments automatically (a person records payments).
- Delivery receipts, bounce handling and read tracking for emails (UNISON records that the message was handed to the mail
  server, as it does today).
- Automatic renewal, and any change to what HIVE reads (the client feed is unchanged).
- Changing the quote portal's accept/decline flow or its consent wording (the legal review of that wording is still owed).

## Anti-goals (a failure even if it technically works)

- An invoice emailed from a draft that failed its checks.
- A client receiving two invoices for the same month, or a reminder for an invoice that is paid or paused.
- An invoice marked paid, or reminders stopped, by anything other than a recorded payment (or a recorded pause).
- A first invoice sent without the owner's approval, or monthly invoices sent before the first one was approved.
- Billing happening in an organisation that has not switched it on.
- Money or client data crossing from one organisation to another.

## What already exists (inspected 2026-10-26)

- **Acceptance record** (portal slice 2): who accepted (verified by an emailed code), when, which quote version, a fingerprint of
  the quote, the IP address and browser; append-only. The quote's status becomes Accepted in the same transaction. The owner and
  the member who sent the link are notified, and the owner can be reached by email even without a login.
- **Quote lines** have a charge kind (once-off or monthly); quotes accepted on the portal show the client the initial total
  (once-off plus first month) and the monthly figure including VAT. Older quotes have lines with no charge kind.
- **Quote to invoice:** a staff button (`create_invoice_from_quote`) copies the lines, prices, VAT codes and the offerings
  behind the terms into a **draft** invoice. It copies the whole quote, and **nothing stops it being pressed twice**: the unique
  indexes that once guaranteed one first invoice were dropped with the retired engagement columns. Production has 1 invoice
  and 0 payments.
- **Issuing:** `issue_invoice` numbers the invoice, dates it the day it is issued (never backdated), sets the due date from the
  company default (30 days), freezes the client's and the company's details onto it, and checks only: a client is linked, at
  least one line, the company legal name and document prefix are set, and the due date is not before the issue date. It
  works only for a signed-in member.
- **Emailing:** an invoice is emailed with its PDF from the company mailbox (Microsoft Graph) by a server action that needs a
  signed-in member; every send is recorded (`document_emails`, with the PDF's hash); there is an hourly cap per
  organisation. Delivery receipts are not tracked.
- **Payments:** a `payments` table (recorded by hand, never edited or deleted, voided with a reason); the invoice balance and
  Paid / Partially paid are worked out from it; a nightly database job marks invoices Overdue (00:05 South African time);
  a forecast view exists. The "Card" method is only a label.
- **Notifications, tasks and the timeline** are written by database functions (as the portal does); the generic automation
  engine only supports notification actions and has no rules.
- **Onboarding:** a manual `client_onboardings` record with stages; nothing creates one automatically.
- **Sales:** every production quote links to an opportunity; accepting a quote does not touch it, and nothing creates one when it
  is missing.
- **Company settings in production:** bank details are set; **the company VAT number is blank** although VAT is charged (a South
  African tax invoice must show the supplier's VAT number); default payment terms are 30 days.
- **Scheduled work** today is database cron jobs (expiry, overdue). They cannot send email: sending needs the Node side.

## Design

### 1. The billing plan

When a quote accepted on the portal has charge kinds, UNISON creates a **billing plan** for it: one row per invoice it will
produce, each with a due date and a status.

- **Item 1, the first invoice:** the quote's once-off lines plus its monthly lines once (the first month). It is created at
  acceptance and issued as soon as the owner approves it; its due date is the company's default payment days (30 today), which
  the owner may change on the draft before approving. Quotes with no monthly lines produce this single item and go through the
  same approval. Lines with no charge kind (older quotes) are treated as once-off (the builder's call to confirm: it matches
  how the portal shows them, as one flat list).
- **Items 2 to N, the later months:** the monthly lines only, one item per month, dated on the start-date day of each month
  (if the start date is the 15th, the 15th; for a start date such as the 31st the last day of shorter months, a builder's
  call). Month 2 is dated one month after the start date, and so on up to the term.
- A plan item has a unique key (quote, month number), so one month can never produce two invoices. The invoice created for an
  item carries a reference to it, also unique.
- While the organisation's billing switch is on, a quote with a monthly charge **cannot be sent without a start date and a
  term**. Both are frozen once the quote is sent and appear on the portal, the PDF and the email ("R15,000 per month for 12
  months from 15 December 2026"). A plan is created for every quote accepted on the portal while the switch is on. A quote with
  monthly lines that was sent without a start date and term (for example before the switch was on) gets only the draft first
  invoice, and the owner is told that its monthly invoices must be created by hand; the existing button remains for quotes
  accepted by hand or before the switch.
- The plan, its items and their states are visible on the quote page, including "waiting for first invoice approval".
- **Ending a plan early** (a client leaves, an agreement changes) is a manual decision with a recorded reason; unsent items are
  cancelled and nothing is refunded or credited automatically.

### 2. At acceptance (portal only)

In the same transaction that records the acceptance, a database function (inside the guarded follow-up block, so a failure there
never undoes the acceptance):

- **Sales:** marks the quote's opportunity Won; if the quote has no opportunity it creates one linked to the client and the
  quote. An opportunity is never created if the quote already has one. Its value is the whole agreement excluding VAT (once-off
  fees plus monthly charge times term), written only if the opportunity has no value yet (owner's decision 12). (Builder's call:
  the Won stage and its date use the existing rules.)
- **Billing plan:** creates the plan and **a draft first invoice** from item 1 (copying the lines, prices, VAT codes, terms
  offerings and payment terms as `create_invoice_from_quote` does, restricted to the item's lines).
- **Onboarding:** creates the client's onboarding record (one per quote) with the quote's owner and start date, and a task for the
  owner: contact the client within one business day.
- **Notification:** tells the owner (and the sender of the link) that the first invoice is ready for approval, in the app and by
  email.
- A nightly sweep finds portal acceptances that have no plan (for example because the follow-up block failed) and creates them,
  idempotently.
- A quote set to Accepted **by hand** is unchanged: the button remains and creates the first invoice once; it does not build a
  plan unless the quote was sent with a start date and term, in which case it builds the same plan.

All of this is behind an organisation setting, **off by default**; with it off, acceptance does exactly what it does today.

### 3. The first invoice: approval

The draft first invoice shows on the quote and in the Invoices list as "waiting for approval". The owner reviews it and presses
**Approve and send**, which re-runs the checks, issues the invoice, generates the PDF and emails it to the client. If a check
fails the owner is told which, and fixes the data (for example the client's billing email) first. Until approval the monthly items
stay "waiting". If the draft sits unapproved for two days the owner is reminded again, and again every two days.

### 4. The checks (before any invoice is issued, first or monthly)

A system issues an invoice only when all of these hold (the builder's list, to be confirmed in the plan): the company legal name,
document prefix and **VAT number** (whenever any line carries standard VAT) are set; the bank details are complete; the client has
a billing email (or, failing that, a contact email) and a billing address; the invoice has lines and a total above zero; for a
monthly item the plan is active and its first invoice was approved and sent; the item has not already produced an invoice; and the
organisation has not reached the hourly email cap. The existing checks of `issue_invoice` still apply. When a check fails for a
monthly item, the invoice is kept as a draft, the owner is told which check failed, and nothing is sent.

### 5. Monthly invoices and the runner

A scheduled **runner** (a daily request to a protected route; one new secret to authenticate it) does the work that needs email:

- it picks plan items that are due (using row locks that skip rows another run holds), issues the invoice, makes the PDF and emails
  it to the client with Reply-To set to the quote's owner, then records the send;
- an invoice is dated the day it is actually issued, with the company's default payment days;
- if a month is released late (for example the first invoice was approved after a monthly date), items whose date has passed are
  released as soon as the first invoice is approved, **one per month; if more than one is due at once they are held as drafts for the
  owner to check** (the owner's rule, to be confirmed: simplest is to hold them);
- monthly invoices do not wait for the first invoice to be paid, only to be approved and sent (owner's decision 11);
- re-running the runner, or running two at once, creates nothing twice: the unique keys and the item status guarantee it.

### 6. Reminders

For an invoice that is unpaid (Issued, Partially paid or Overdue) the runner sends a friendly reminder **3 days after the due
date**, then **one every 7 days**, **five reminders in total** (3, 10, 17, 24 and 31 days after the due date; the owner confirms the
count). Each reminder carries the invoice number, the balance still owing, the bank details, the payment reference and the invoice
PDF. A recorded payment in full ends the reminders at once; a part payment keeps them going for the balance. Staff can **pause
reminders on one invoice** with a recorded reason. After the last reminder the owner is told and gets a follow-up task. Every reminder
is recorded (a table with a unique key per invoice and sequence, so a reminder is never sent twice) and appears on the invoice and
the client's timeline. Reminders sit behind their own organisation setting, off by default.

### 7. Payment

An invoice and its email show the company's bank details and the **invoice number as the payment reference**. A person records the
payment in UNISON when it appears on the bank statement (as today). Nothing marks an invoice paid except a recorded payment. The
amount outstanding is shown on the invoice and the quote.

### 8. Starting the work

The quote page shows a **readiness** line: the work may start when the start date has arrived **and** the first invoice is fully
paid. If the start date has arrived and it is unpaid the line says so and the owner can **override** (with a reason) quote by quote.
The rule lives in one place so it can become a setting later. Nothing is sent to HIVE; if HIVE should wait for payment, a read-only
"first invoice paid" field can be added to the existing client feed later, if HIVE's maintainers ask.

### 9. Stages of delivery

Each stage is its own plan and can be shipped and switched on separately:

1. **Foundation:** the start date and term on quotes (and on the portal, PDF and email); the billing plan tables with their unique
   keys; the duplicate guard on the existing button; the Sales update; the draft first invoice and the owner's notification and
   approval screen. (No automatic sending yet.)
2. **Automatic sending:** the system path to issue and email without a signed-in user, the checks, the runner and the monthly items.
3. **Payments and reminders:** the reminders, the pause control, the follow-up after the last reminder, outstanding balances on the
   quote.
4. **Starting the work:** the onboarding record, the readiness line and the override.

## Calls settled after a builder check (mine; the owner can veto any)

A reviewer read this document cold and asked ten questions. These are my answers; the two that are the owner's are in the next
section.

1. **Separate switches per stage.** Stage 1 (plan, draft first invoice, Sales update) has its own switch, as do Stage 2
   (automatic monthly sending) and Stage 3 (reminders); all off by default. Stage 1's switch should only be turned on after
   Stage 2 has shipped. To avoid double billing in the meantime, Stage 1 includes a per-month "Create this month's invoice" action
   on a plan item; it links the invoice to the item, so the runner can never bill that month again.
2. **A plan pauses when its quote stops being Accepted** (moved back to Sent, Declined, archived) or its client is archived. Nothing
   is billed while it is paused; the owner is told; resuming is a manual decision.
3. **Quotes with only once-off lines** get a one-item plan and the same first-invoice approval. The start-date-and-term
   requirement applies only to quotes with monthly lines and only while the billing switch is on.
4. **The first invoice's due date** is the company default (30 days); the owner can edit the due date on the draft. Reminders count
   from the due date.
5. **Reminders cover only invoices issued by the billing system** (plan invoices), not invoices created by hand, and only invoices
   that fall due after the reminders switch is turned on. Nothing is sent retroactively, and at most one reminder per invoice is
   sent in any run, so a burst cannot happen.
6. **Who approves the first invoice:** an organisation owner or admin. The quote's owner and the member who sent the link are
   notified; if they are not an owner or admin they cannot press the button, and the notice says who can.
7. **The draft first invoice is locked to the quote:** its lines, prices and quantities cannot be edited; the due date and the
   notes can. If the amounts must change, the owner discards the draft and creates the invoice by hand (a manual decision).
8. **VAT on the monthly invoices is the rate in force on the day each invoice is issued** (the existing rule), so if the law changes
   during a term the monthly total can differ from the figure the client accepted; the owner is notified when an invoice's rate
   differs from the quote's. This is a tax question the owner's accountant should confirm.

## Constraints

- The production database is the only database; migrations are additive and append-only; test data is removed after every run.
- Sending email from a system path means a new server-side module with powers a user does not have; it is the only place that may do
  so, it is listed in the service-role boundary test with its reason, and it never logs an address, a token or an invoice body.
- Each organisation switch (automatic billing, reminders) is off by default; shipping each stage changes nothing until it is switched
  on.
- The portal's accept/decline flow, its consent wording and the HIVE feed are not changed by this project.
- Invoice numbers, dates and the frozen client and company details follow the existing `issue_invoice` rules; an invoice is never
  backdated.
- The legal and privacy review of the portal (ECTA, POPIA) is still owed and is not made easier or harder by this project; the
  consent wording may need a sentence that an invoice follows, which is for that review.

## What is left to the builder

- The exact table design for the billing plan, reminders and the readiness override; how the runner is authenticated and scheduled
  (the host's cron feature with a shared secret is the expected route).
- How a start date such as the 29th to 31st is handled in shorter months.
- The wording of the new emails (invoice, reminder, reminder-finished notice); client-facing wording is drafted for the owner's
  approval, in the one copy file, as with the portal.
- The status words and the layout of the plan on the quote page; the "waiting for approval" presentation in the Invoices list.

## Needs the owner

- **The company VAT number** in Settings > Company details (blank today). Without it the checks would hold every invoice.
- Approval of the wording of the invoice email, the reminders and the notices.
- (Settled 2026-10-26, decisions 11 and 12: monthly invoices do not wait for payment of the first; a Won Sales record is valued
  at the whole agreement excluding VAT. Nothing open on those.)
- Confirmation of the reminder count (five in total) and that two simultaneous late monthly invoices are held rather than sent.
- Whether the "work starts when paid" rule should be the default for all quotes or only some.
