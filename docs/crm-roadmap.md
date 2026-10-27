# UNISON CRM roadmap

Written 2026-10-10 from a review of the code, the live schema and the security advisor. Tick items off as
they ship. Evidence for each item is in the review notes under "Basis" at the bottom.

**Reminder rule:** when every box in Stage 1 is ticked, tell the user the daily CRM loop is done and walk
them through Stage 2 before starting anything else.

## Before anything else

- [ ] **Decide what happens to the delivery half** (about 25 tables, dozens of pages): retire it, keep it as a
      separate product, or bring it back as an add-on. Until this is decided, the stale docs and the tier
      definitions stay wrong. (`product-definition.md`, `first-buyer-readiness.md`, `permissions.md` and the
      Core/Framework tier descriptions still describe a delivery product.)

## Stage 1: the daily CRM loop (built 2026-10-10; walked signed in 2026-10-11)

- [x] Lead → client conversion (creates the client, a primary contact and an opportunity; links back to the lead)
- [x] Contacts: several people per client and per lead, one marked primary
- [x] Activity log: calls, meetings, emails and notes on a client, lead, quote or opportunity
- [x] Tasks and follow-ups created from a record, shown on that record, and feeding My Tasks on the dashboard
- [x] Quick stage change on an opportunity (without opening the edit form; saved with a Change stage button)
- [x] Tests for each of the above, including the database rules (RLS suite) and a fixture preview at three widths
- [x] **Walked in a signed-in session against real records** (walked 2026-10-11 by the user; the walk found that nothing linked a login to a team profile, fixed by migration 20261011170000)

## Stage 2: make quotes and invoices real documents (slices A, B and C built 2026-10-11; waiting for the signed-in walk-through)

- [x] Quote line items and a products/services price list (invoices too)
- [x] Generated quote and invoice numbers (no more typing them)
- [x] Tax and totals worked out from the lines, not typed
- [ ] **Walked in a signed-in session against real records** (not done yet: the user does this; slice A is not finished until it is)
- [x] PDF for a quote and an invoice (slice B; download from a sent quote or issued invoice)
- [x] Send a quote or invoice by email, and record that it was sent (slice B; shared company mailbox, every send recorded)
- [x] Quote → invoice in one step (slice B; from an Accepted quote, every line copied)
- [ ] **Slice B walked in a signed-in session, including one real email** (not done yet: the user does this)
- [x] Payments table; the invoice balance and "Paid" / "Partially paid" come from it (slice C; payments are voided, never edited or deleted)
- [x] "Overdue" set automatically, not by hand (slice C; a nightly database job at 00:05 South African time)
- [x] Forecast worked out from the pipeline instead of typed in (slice C; a read-only month-by-month view from payments, unpaid invoices and the pipeline)
- [ ] **Slice C walked in a signed-in session** (not done yet: the user does this, and the first real nightly run is on the first night after deploy)

- [x] Pricing and credit model: the HIMARK rate card (28 items), packages recorded on the client, first, monthly and top-up invoices built from it as drafts with locked prices, per-tier limits on active projects, tier changes without a new implementation fee (built 2026-10-12, waiting for the signed-in walk-through; credit balances, expiry and rollover are not built)
- [x] Commercial terms foundation (build 1 of the terms engine): versioned, approved terms templates with company-wide, offering and project layers, placeholders from the rate card, and a Settings > Commercial terms screen (built 2026-10-12). The two terms tables and the approval functions are live in production. HIMARK has 22 templates and 12 approved versions: 10 retainer and project wordings, plus the company quote terms and payment terms copied from the company settings. The support-service templates are empty and need wording. The quote and invoice forms are not connected yet: that is build 2; credit allocations are build 3. Walked signed in by the user on 2026-10-12 (the Settings screens)
- [x] Commercial terms on quotes and invoices (build 2 of the terms engine): offerings and Fill terms on drafts, wording, inclusions and template versions stored and frozen on the document, invoices take the quote's offerings, company text boxes retired once a company template is in force (built 2026-10-13; database behaviour checked in a rolled-back transaction, not yet walked signed in). Credit allocations are build 3.
- [x] Quote portal, slice 1 (branded quotation email with a secure link, the client page at `/q/<token>` with PDF download, Revise this quote; built 2026-10-19): built behind a per-organisation switch (Settings, Company details) that is off; waiting for one real send to the owner's own address. Slice 3 (HIVE feed gate) is built; see the lines below. Spec: `docs/superpowers/specs/2026-10-18-quote-portal-design.md`; what is not verified and what is open is in `docs/follow-ups.md` under "From the quote portal, slice 1"
- [x] Quote portal, slice 2 (accept and decline with an emailed code, the decision record, owner notices, the decline follow-up task, the recorded response on the quote page; built 2026-10-25): built and tested; keep the portal switch off until the legal and privacy review (ECTA, POPIA) is done, because turning it on now launches electronic acceptance. Before switching it on, read "Read before you switch the portal on" in `docs/follow-ups.md` under "From the quote portal, slice 2". Slice 3 (HIVE feed gate) is built (see the next line)
- [x] Quote portal, slice 3 (the HIVE feed gate: a setting that makes the HIVE client feed return only clients with an accepted quote, a switch with an impact preview in Settings > Integrations, a status line on the quote page; built 2026-10-25): built behind a setting that is off, so HIVE sees what it saw before until an owner switches it on. Before switching it on, read "Read before you switch the feed gate on" in `docs/follow-ups.md` under "From the quote portal, slice 3", and tell HIVE's maintainers first (with the clients and quotes of 2026-10-25 it would leave the feed empty). This completes the three-slice quote portal
- [x] Accept to invoice, Stage 1 (a start date and term on quotes, shown on the portal, PDF and email; on acceptance the Sales record goes Won and a billing plan and a draft first invoice are made; an owner or admin approves the first invoice with Approve and send; later months are made by hand from the Billing plan panel; built 2026-10-26 to 2026-10-27): built behind a per-organisation switch (Settings, Company details, "Billing plans") that is off for HIMARK. Stages 2 to 4 are next and not started: automatic sending of the monthly invoices (Stage 2), payment reminders and outstanding balances (Stage 3), the onboarding record, readiness line and override (Stage 4). The design says to switch it on only after Stage 2 ships, and the company VAT number has to be filled in first; read "Read before you switch billing plans on" in `docs/follow-ups.md` under "From accept-to-invoice, Stage 1". Spec: `docs/superpowers/specs/2026-10-26-accept-to-invoice-to-payment-design.md`

## Stage 3: make the registers scale

- [x] Search, filter, sort and paging on Leads, Quotes, Sales, Invoices and Expenses (built 2026-10-11, waiting for the signed-in walk-through)
      (they currently load every row; Supabase silently stops at 1,000)
- [x] Detail pages load one record, not the whole table (built 2026-10-11)
- [x] Export from each register (everything matching the filters, up to 5,000 rows; built 2026-10-11)
- [ ] Sales targets and a reports page beyond the dashboard

## Stage 4: permissions and notifications

- [ ] CRM roles beyond owner / admin / member (for example sales rep, finance)
- [ ] "My records only" visibility for sales reps, if wanted
- [ ] Finance records (invoices, expenses) restricted to finance and admin; expense approval not by the submitter
- [ ] Notifications for CRM events: new lead, quote accepted, task assigned, invoice overdue
- [ ] Email notifications, not only in-app
- [ ] Automations that can act on CRM events (today they can only message every member)

## Stage 5: operations and engineering

- [ ] **UAT environment** on its own address with its own database (steps already written up; the user will do
      the Vercel, DNS, Entra and Supabase dashboard parts)
- [ ] CI on pull requests: typecheck, unit tests, build
- [ ] Install ESLint so `pnpm lint` works, then fix what it finds
- [ ] Run the RLS tests against the UAT database, not production
- [ ] Remove the 75 `as any` casts by regenerating and using the database types
- [ ] Revoke public execute on `record_framework_version`, `record_delivery_item_phase` and
      `project_dependencies_reject_cycle`
- [ ] Turn on leaked-password protection; decide on MFA / SSO enforcement
- [ ] Move `pg_trgm` and `btree_gist` out of the `public` schema
- [ ] Add `project_dependencies` to the test cleanup sweep, and delete its ~570 orphaned audit rows
- [ ] Browser (end to end) tests for the main CRM journeys

## Still to check in a real signed-in session

- [ ] CRM dashboard against real records (production has none yet)
- [ ] Governance tab: risks, evidence, decisions, approvals (Draft / Submit), framework gates
- [ ] Integrations checklist
- [ ] Delivery item "View" page and a phase change
- [ ] Unedited framework form: does saving it change anything?

## Smaller items already recorded

See `docs/follow-ups.md`, especially the CRM dashboard section (re-stamped invoice and expense dates, no
organisation timezone / currency setting, approval-history forgery, failed-save form reset).

## Basis

Review of 2026-10-10. Not examined closely: Calendar, Leave/HR, Support, Knowledge and the internal HIMARK
admin area.
