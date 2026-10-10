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

## Stage 1: the daily CRM loop (built 2026-10-10; waiting for the signed-in walk-through)

- [x] Lead → client conversion (creates the client, a primary contact and an opportunity; links back to the lead)
- [x] Contacts: several people per client and per lead, one marked primary
- [x] Activity log: calls, meetings, emails and notes on a client, lead, quote or opportunity
- [x] Tasks and follow-ups created from a record, shown on that record, and feeding My Tasks on the dashboard
- [x] Quick stage change on an opportunity (without opening the edit form; saved with a Change stage button)
- [x] Tests for each of the above, including the database rules (RLS suite) and a fixture preview at three widths
- [ ] **Walked in a signed-in session against real records** (not done yet: the user does this; Stage 1 is not finished until it is)

## Stage 2: make quotes and invoices real documents (slice A built 2026-10-11; waiting for the signed-in walk-through)

- [x] Quote line items and a products/services price list (invoices too)
- [x] Generated quote and invoice numbers (no more typing them)
- [x] Tax and totals worked out from the lines, not typed
- [ ] **Walked in a signed-in session against real records** (not done yet: the user does this; slice A is not finished until it is)
- [ ] PDF for a quote and an invoice
- [ ] Send a quote or invoice by email, and record that it was sent
- [ ] Quote → invoice in one step
- [ ] Payments table; the invoice balance and "Paid" / "Partially paid" come from it
- [ ] "Overdue" set automatically, not by hand
- [ ] Forecast worked out from the pipeline instead of typed in

## Stage 3: make the registers scale

- [ ] Search, filter, sort and paging on Leads, Quotes, Sales, Invoices and Expenses
      (they currently load every row; Supabase silently stops at 1,000)
- [ ] Detail pages load one record, not the whole table
- [ ] Export from each register
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
