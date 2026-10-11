# Pricing and credit model: the rate card and package billing

Date: 2026-10-11. Status: design approved in conversation section by section; this document is for the written-spec review.

Source of truth for every price and credit count below: `HIMARK_Pricing_2026_Unified_Billing_Model.xlsx` (sheets Billing Overview,
Project Billing, Top-Up Calculator, Commercial Rules, Retainers, Projects, Credit Assumptions). All amounts are in rand, **excluding
VAT**, unless a line says otherwise. VAT is 15% and comes from the organisation's settings, as it already does.

## 1. What this is for

Every retainer and project price in UNISON must follow the workbook's pricing and credit model: fixed prices from a rate card,
credits included in the fee (never charged twice), a one-time implementation fee on a retainer's first invoice only, optional
monthly support only if signed, and top-ups as their own separate line. Today UNISON has an empty price list and freehand line
prices, so nothing stops a wrong price or a double charge.

**Chosen scope (user, 2026-10-11):** prices and billing rules. **Not** credit balances.
**Chosen approach (user):** the client's package is recorded on the client, and invoices are built from it by buttons the person
presses. Nothing is issued automatically.

## 2. The rate card

Held in the existing `price_list_items`, so quote and invoice lines work as they do now. 28 items, loaded by the migration for the
HIMARK organisation (`00000000-0000-4000-8000-000000000001`). VAT code `standard` on every item.

**Retainers (monthly fee includes the credits; implementation credits equal the monthly credits; implementation fee = implementation
credits x the tier's rate per credit):**

| Tier | Monthly fee | Credits included per month | One-time implementation fee | Implementation credits | Top-up rate per credit | Active projects allowed |
|---|---|---|---|---|---|---|
| Signature Partner | 100,000 | 40 | 100,000 | 40 | 2,500.00 | 2 |
| Growth Partner | 150,000 | 75 | 150,000 | 75 | 2,000.00 | 4 |
| Private Partner | 200,000 | 120 | 200,000 | 120 | 1,666.67 | 6 |
| HIMARK Reserve | 300,000 | 220 | 300,000 | 220 | 1,363.64 | No limit until one is set |

The "active projects allowed" number (the tier's **initiative limit**, user-supplied 2026-10-11) is stored on the rate card item,
so an owner or admin can change it, and set one for HIMARK Reserve, without a code change. See section 4 for how it is applied.

**Standalone projects (the fee includes its implementation credits):**

| Project | Fee | Credits included |
|---|---|---|
| Operating Model & Operations Transformation | 120,000 | 40 |
| Intelligence & AI Transformation | 150,000 | 50 |
| Digital Experience | 65,000 | 22 |
| Digital Presence | 45,000 | 15 |
| Visual Communication & Operations | 35,000 | 12 |

One project top-up rate: 3,000.00 per credit.

**Optional monthly support (each includes its own monthly credits; sold only when signed):**

| Service | Project it belongs to | Monthly fee | Credits | Type |
|---|---|---|---|---|
| Operations Improvement Support | Operating Model & Operations Transformation | 35,000 | 12 | Core |
| AI & Automation Care | Intelligence & AI Transformation | 15,000 | 5 | Core |
| Digital Experience Management | Digital Experience | 30,000 | 10 | Core |
| Application & Interface Care | Digital Experience | 10,000 | 3 | Optional |
| Digital Presence Management | Digital Presence | 20,000 | 7 | Core |
| Website Care | Digital Presence | 5,000 | 2 | Optional |
| Communication & Asset Care | Visual Communication & Operations | 5,000 | 2 | Core |
| Podcast Content | Visual Communication & Operations | 25,000 | 8 | Optional |
| Integrated Podcast & Social Media Content | Visual Communication & Operations | 40,000 | 13 | Alternative bundle |
| Social Media Content | Visual Communication & Operations | 20,000 | 7 | Optional |

**Count:** 4 retainer monthly + 4 implementation + 5 projects + 10 support + 5 top-up rates (4 retainer tiers and 1 project) = 28.

**Fixed first-invoice and monthly amounts the tests must reproduce (including VAT):**

| Tier | First invoice (monthly fee + implementation fee, plus VAT) | Month 2 onwards (monthly fee plus VAT) |
|---|---|---|
| Signature Partner | 230,000.00 | 115,000.00 |
| Growth Partner | 345,000.00 | 172,500.00 |
| Private Partner | 460,000.00 | 230,000.00 |
| HIMARK Reserve | 690,000.00 | 345,000.00 |

(The workbook shows Private's first invoice as 459,999.9999999999, a floating-point artefact of the same calculation; UNISON rounds
to the cent.)

**Wording on the lines:** the credits appear in the line text only, for example "Growth Partner: monthly retainer. Includes 75
credits a month." Credits are not balances.

**Top-up rates are marked "proposed".** The workbook says they are not agreed contract prices and "obtain commercial approval
before quoting"; the rate card shows that note, and a quote or invoice built from them carries it in the line description.

## 3. Rules for the rate card items

- **Only an owner or admin can change a rate card item** (its price, description, initiative limit, or archive it), because the workbook says base
  prices need management approval. Members can still add their own custom price-list items.
- The identifying columns of a rate card item (`rate_key`, `item_kind`, `package_key`, `credits`) never change through the app, and a
  signed-in user cannot create a row with a `rate_key`. Only the migration (and a later admin migration) adds rate card items.
- **Lines built from the rate card are locked** (`rate_locked`): a signed-in user cannot change a locked line's price, quantity,
  title or description, nor add a locked line by hand. They can delete one only while the document is still a draft, as with any
  line. Custom lines are unaffected.
- Prices on a draft built earlier are **copies** taken when the draft was built; changing the rate card later does not change
  documents already built (an invoice must not change under a client). A draft built at an old price can be deleted and rebuilt.

## 4. The client's package

A new "Billing package" section on the client page.

- **Engagement:** one row per package a client is on (`client_engagements`: client, package key, start date, optional end date).
  A client can have **one active retainer** and **any number of projects** (each project is its own engagement; a client can buy
  two different projects, or the same project twice, as separate engagements).
- **Initiative limit (retainer clients).** The projects a client with an active retainer has running are its **active initiatives**
  (a project engagement with no end date; support services do not count). A tier allows only so many (Signature 2, Growth 4,
  Private 6, HIMARK Reserve none set). Recording another project when the client is already at the limit is **refused** with a
  message that names the limit and says to upgrade the tier (`INITIATIVE_LIMIT_REACHED`). Ending a project frees a place. A client
  with no retainer (a standalone project client) has no limit. The limit comes from the rate card item of the retainer tier, so it is
  adjustable by an owner or admin; empty means no limit.
- **Projects under a retainer are billed their own implementation fee,** the project's fee from the rate card (section 2), through
  "Create first invoice" on that project, once each. The retainer itself has no second implementation fee.
- **Support services** (`engagement_support`: engagement, service key, start date, optional end date) attach to a **project**
  engagement, and only a service belonging to that project can be added. A service is billed in each month from the month it starts
  until the month it ends. There is no proration.
- Recording a retainer or project sets the client's existing `engagement_type` (Retainer or Project) so the dashboard split stays
  right; it is only set when empty or when the first engagement is recorded.
- **Changing tier (upgrade or downgrade)** is its own action, not "end and start again". It ends the current retainer and starts
  the new tier with a link back to it (`replaces_id`), and **no new retainer implementation fee is billed**: the old retainer's first
  invoice stands for the whole chain. After an upgrade only the implementation fees of projects added under the new tier are
  billed. The change is refused if the client already has more active projects than the new tier allows
  (`INITIATIVE_LIMIT_REACHED`, which only a downgrade can hit). The new tier's monthly fee applies in the month's invoice built
  after the change (section 5).

## 5. The buttons and what they build

All build **drafts**. You review and issue them yourself with the existing Issue and Send buttons. Each is a database function
(security definer, member check, organisation scoped), like `create_invoice_from_quote`, so the rules cannot be bypassed from the
browser. Each also writes an entry on the client's timeline.

- **Create first invoice** (also **Create first quote**) for an engagement:
  - Retainer: two lines, the monthly fee and the one-time implementation fee. (First invoice for Signature: 100,000 + 100,000 +
    VAT = 230,000.)
  - Project: one line, the project fee, with its credits in the text.
  - Refused if a non-cancelled first invoice already exists for that engagement (`FIRST_INVOICE_EXISTS`). A cancelled invoice
    frees the slot. A quote does not occupy the slot; converting an accepted first quote into an invoice (the existing button)
    **carries the engagement link over**, so the once-only rule still applies to the invoice.
- **Create this month's invoice** for a client (the month is the current South African month by default):
  - One draft per client per month: the active retainer's monthly fee plus one line for each support service active that month.
  - The retainer's own first month is covered by its first invoice, so the monthly invoice starts the month after the retainer
    chain started (its first retainer), and is refused when that first invoice does not exist yet (`FIRST_INVOICE_MISSING`).
  - The retainer line uses the tier in force on the last day of that month. A tier change made before that month's invoice is built
    applies to the whole month (no proration); one made after it applies from the next month.
  - Refused if there is nothing to bill (`NOTHING_TO_BILL`) or a non-cancelled monthly invoice for that client and month already
    exists (`MONTH_ALREADY_BILLED`).
- **Change tier** for the active retainer: pick the new tier and the date it starts. Builds nothing by itself; see section 4.
- **Add top-up** for an engagement: you enter the number of credits (a whole number, at least 1). One draft invoice with one line:
  credits x the rate for that engagement's tier (retainer) or project rate. Locked, like every rate card line. No uniqueness rule:
  top-ups can be bought any number of times.

Each of these needs the organisation's company details (invoice numbering already requires them), with the existing error message
if missing.

## 6. Data changes (one migration, append-only)

- `price_list_items`: add `rate_key text`, `item_kind text`, `package_key text`, `credits numeric(8,2)`, `rate_status text`
  (`agreed` or `proposed`), `initiative_limit integer` (positive; used on retainer monthly items only; null means no limit); unique `(organization_id, rate_key)` where not null; a guard trigger for section 3.
- `quote_lines`, `invoice_lines`: add `rate_locked boolean not null default false`; a guard trigger for section 3;
  `create_invoice_from_quote` copies it.
- `invoices`: add `engagement_id`, `billing_kind` (`first`, `monthly`, `top_up`), `billing_month date`. Unique partial indexes:
  one `first` per engagement and one `monthly` per client and month, among non-cancelled invoices. `quotes`: add `engagement_id`
  and `billing_kind` (only `first`). A guard stops signed-in users setting or changing these columns directly.
- New tables `client_engagements` (with `replaces_id` and `root_id`, the first engagement of a retainer chain) and `engagement_support`, organisation scoped, audit and updated-at triggers like the other
  tables. Select for members; written only through the functions in section 5 and small functions to end an engagement or a
  support service (`set_client_package`, `change_retainer_tier`, `end_engagement`, `add_support_service`, `end_support_service`). The initiative limit is
  enforced inside `set_client_package` for projects and `change_retainer_tier`, and also by a trigger on `client_engagements` so no
  other path can exceed it.
- The 28 rate card rows for HIMARK, in the same migration.
- `create_invoice_from_quote` re-created to carry the engagement link and `rate_locked`.

## 7. Screens

- **Client page:** "Billing package" section as in section 4 and 5, with messages for each refusal token in plain language.
- **Settings > Price list:** rate card items grouped and tagged "Rate card", with the credits shown and "Proposed rate" where
  that applies; editable by owners and admins only (read-only for members, with a note).
- **Quote and invoice line editor:** a locked line shows its price and quantity without edit controls, with a "Rate card price"
  note. The "pick a price list item" control lists only custom items. Rate card items are not offered there, so a rate card price cannot be re-created as an editable line; locked lines come only from the buttons.
- **Removed:** `features/clients/components/client-setup-workflow.tsx` (nothing imports it) and the tests that reference it,
  because it still shows the old prices (Signature R185,000, Growth R120,000, Private R75,000, foundation fee R250,000).

## 8. Checks

- **Unit test of the rate card:** a data file in code lists every price, credit count and top-up rate above; the test asserts all
  28 items and the eight amounts in the first-invoice and month-2 table (rounded to the cent), and that the migration's seed rows
  match the data file.
- **Database tests (RLS suite):** first-invoice contents for a retainer and a project; refusal of a second first invoice, and a
  cancelled one freeing the slot; one monthly invoice per client per month, and a cancelled one freeing it; monthly refused
  before the first invoice exists; support only for its own project; billing of a support service starts and stops in the right
  months; top-up uses the right rate per tier and for projects and refuses zero, negative and fractional credits; locked lines
  cannot be edited or hand-made and cannot have their price changed by a member; a member cannot edit a rate card item but an
  admin can; the initiative limit (2, 4 and 6 refuse the next project; Reserve with no limit never refuses; an admin raising or setting a limit
  takes effect; ending a project frees a place; a client with no retainer has no limit; a member cannot change a limit); a tier
  upgrade builds no implementation fee, keeps the chain's first invoice valid for monthly billing, bills the new tier in the
  month built after the change and the old tier if that month was already built, and a project added after the upgrade is billed
  its own fee; a downgrade below the active project count is refused;
  quote-to-invoice carries the link and the lock; nothing crosses organisations; setting a package sets the client's
  type.
- **Source tests** that the removed file is gone and the new screens and tokens are wired.
- Rolled-back dry run of the migration, then applied to production; every test row (and its audit rows) removed, production
  verified clean. The migration seeds only the HIMARK rows, which stay; no other test data remains.
- The Stage 2 walk-through then includes: set a package, build the first invoice, the monthly invoice, a top-up, and check the
  numbers against the table in section 2.

## 9. Not in this slice

Credit balances, usage tracking, expiry and rollover (the workbook says track allocation, reserved, consumed, remaining and
expiry independently, and that credit use is tracked against work in HIVE); automatic monthly invoices; proration; the "Strategic
Consulting" service (no price in the workbook); revenue recognition; the workbook's cost and margin sensitivity (it is
illustrative).

## 10. Decisions still open (from the workbook and from this design)

The workbook lists these as undecided; this slice does not decide them.

1. Do included monthly credits expire, roll over or get forfeited?
2. Top-up rate multipliers or discounts, minimum purchase, validity, and whether unused top-ups roll over.
3. Wording that initial implementation credits are a distinct one-time scope, not a second charge for the same monthly work.
4. Per-project scope, deliverables, exclusions, acceptance criteria, change requests, and refund and dispute handling.
5. When recurring support starts and whether it may overlap with the build phase (this slice bills from the support service's
   start date, with no proration).
6. Actual cost per delivered credit and utilisation.
7. Earned revenue recognition versus cash invoicing.
8. Credits on a tier change: this slice bills no new retainer implementation fee on an upgrade or downgrade (user, 2026-10-11).
   Whether an upgrade also grants the extra implementation credits of the higher tier, and how a mid-month change is priced, are
   not decided (there is no proration).
9. The "Integrated Podcast & Social Media Content" bundle is an alternative to Podcast Content and Social Media Content. This
   slice does not stop both being recorded for the same project; the person recording support decides.

## 11. Assumptions made in this design (change any of them)

- One active retainer per client; projects any number, up to the tier's initiative limit when the client has a retainer.
- A project under a retainer is billed the rate card project fee as its implementation fee.
- Only active projects count towards the limit; ended ones do not, and support services never do.
- Support requires the project engagement it belongs to.
- The monthly invoice is one per client per month, covering the retainer and all that client's active support.
- Quotes can be built for the first bill only, not for monthly invoices or top-ups.
- Rate card prices cannot be changed on a document; only the rate card changes, only by an owner or admin, and only prices going
  forward.
- The migration seeds the rate card for the HIMARK organisation only.
