# Commercial terms on quotes and invoices

**Date:** 2026-10-13
**Status:** Approved (build 2)
**Build:** 2 of 3 of the "Dynamic Quotation & Invoice Terms Engine" brief. Follows `2026-10-12-commercial-terms-foundation-design.md`.
Build 3 (credit allocations) gets its own spec.

## Why

Build 1 made approved, versioned terms templates. Quotes and invoices still take their terms from free text typed on
each document or from the two default text boxes in company settings. This build connects the two: a document fills its
terms from the approved templates for what is being sold, remembers exactly which versions it used, and keeps that
wording for ever.

## Decisions taken as defaults (change any of these before build)

These were open in `docs/follow-ups.md` (b), (c), (d). Each has a default so the spec is complete; they are cheap to
reverse because they only affect data and labels.

1. **Strategic Consulting** has terms but no rate card row. It is offered on a quote as a **terms-only offering**: you
   pick it in the offering picker, its terms load, and the price lines are typed by hand (as today). No rate card
   row is invented.
2. **Name clash.** The rate card name wins: the offering is shown as "Operations Improvement Support". The brief's
   "AI & Automation Operations" is not added as a second name. Terms are keyed by the stable key, never the label.
3. **"Proposed" prices.** Project Care, Managed Services and Recurring Content are quoted at the rate card's agreed
   support prices. Nothing is labelled "proposed" on a document.

## Scope

**In**
- An **offering picker** on a draft quote: zero or more offerings, each a stable key (retainer tier, project category or
  support service). Defaults from the document itself: the engagement the quote is built for, or the rate card lines
  already on it.
- **Fill terms**: one action on a draft quote or invoice that resolves the layers (company, then each offering, then
  project category) with `resolveTerms` and writes the result into the document's `terms` / `payment_terms` text, plus
  its service inclusions and the list of sources used.
- **Frozen sources**: each document stores which template versions produced its wording.
- **Invoice terms from the accepted quote**: an invoice created from a quote copies the quote's frozen terms
  sources and wording instead of re-resolving.
- **Retire the two default text boxes**: when an approved company template exists, the settings boxes are hidden and
  replaced by a link to Settings > Commercial terms. They remain the fallback for an organisation with no company
  template.
- Service inclusions shown on the quote PDF and print as their own list.
- Unit tests, database tests, and the existing PDF/print checks updated.

**Out**
- Credit allocations, work-size bands, the R2,500 credit rate (Build 3).
- Writing the missing support-service wording or the unapproved policies (late-payment penalty, termination,
  IP transfer, credit expiry). Those stay absent until an administrator writes and approves them.
- Conflict detection between clauses of different offerings. Duplicate lines are removed by the resolver; contradictory
  lines are the author's to resolve in the draft.
- Re-filling documents that were already sent. They never change.

## Behaviour

### Where the offering comes from
1. If the quote has an `engagement_id`, the engagement's package key is the offering (and its support services, if
   the quote is for them).
2. Otherwise each locked rate card line (`rate_locked`, `price_list_item_id` with a `rate_key`) contributes the key
   it was added from.
3. The author can add or remove offerings in the picker. The picker lists every offering that has an approved
   template, plus Strategic Consulting; an offering with no approved terms is listed greyed with "No approved terms".

### Fill terms
- Available on drafts only. If the terms box is empty it fills straight away. If the author has typed terms, the
  action asks to replace them; nothing is overwritten silently.
- The filled text stays **editable** (document-specific wording is still allowed). Editing after filling is recorded
  as `terms_edited = true` so the document shows "Edited from template" rather than claiming template wording.
- `missing` placeholders from the resolver block the fill and are shown by name; a document never carries
  unfilled braces.
- Only approved versions whose effective date has arrived are used (Build 1 selection). If a layer has none, it
  simply contributes nothing, and the result lists which layers were skipped.

### Freezing
- A draft stores its resolved text and sources, so reopening it shows what was filled even if a template has changed
  since. A later template change never alters it. The author can press Fill terms again to re-resolve.
- Sending a quote or invoice already freezes `terms` / `payment_terms` onto the issued document (existing
  `documents_send_issue` behaviour). This build freezes the sources and inclusions in the same step, and the
  immutability trigger guards them like the other issued fields.
- `coalesce(... , default_*_terms)` at issue stays only as the fallback for an organisation without company
  templates.

### Invoice from the accepted quote
- `create_invoice_from_quote` copies `terms_sources`, `terms_inclusions` and the wording into the new invoice, so the
  invoice's commercial wording is exactly what the client accepted.
- The invoice's **payment terms** are resolved separately from templates with `applies_to` of `invoice` or `both`
  (company payment terms, plus offering invoice wording where it exists) and stay editable.
- An invoice not created from a quote (monthly, top-up) resolves its payment terms from the engagement's offering the
  same way.

## Implementation note (2026-10-13)

Production already carried a Build 2 schema applied on 2026-10-12 (`20261012221817_offerings_on_documents.sql`, now recorded in the repo):
offerings live in `quote_offerings` / `invoice_offerings`, the inclusions column is `service_inclusions`, `terms_sources` holds
`{layer, templateId, versionId, version}`, and `set_document_offerings` / `set_document_terms` are the write paths. This build adopts
that schema. Where the data model below differs (`terms_inclusions`, `terms_offerings`, `quote_terms_sources`), production wins; the
follow-up migration `20261013100000_document_terms.sql` only adds the edited-flag/direct-write guard and makes
`create_invoice_from_quote` copy the quote's offerings. Production also renamed "Operations Improvement Support" to "AI & Automation"
and added `add_proposed_support_line` (supports a "Proposed starting price" line); those supersede defaults 2 and 3 above.

## Data model (migration)

On `quotes` and `invoices`:

| Column | Notes |
|---|---|
| `terms_sources` jsonb, default `[]` | array of `{template_id, version_id, version, layer}` from `resolveTerms().sources` |
| `terms_inclusions` text | service inclusions, one per line; null when none |
| `terms_edited` boolean, default false | set by the app when the author changes filled text |
| `terms_offerings` text[], default `{}` | the offering keys chosen in the picker, shape `^[a-z0-9_]{1,60}$` |

- The existing issued-document immutability trigger gains `terms_sources`, `terms_inclusions`, `terms_offerings` and
  `terms_edited` once the status leaves draft.
- A function `set_document_terms(p_kind, p_id, p_terms, p_inclusions, p_sources, p_offerings, p_edited)` (security
  definer, empty search path, membership and draft check) is the only write path for these columns from the app, so
  the sources can be validated server side: every `version_id` must belong to the same organisation and be
  `approved` or `archived`.
- `create_invoice_from_quote` is re-created to copy the new columns.
- The send/issue functions are re-created to keep the new columns unchanged and to stop reading `default_*_terms`
  when the document already carries sources.
- No data backfill: existing documents have empty sources and keep their text exactly as it is.

## Screens

- **Quote and invoice draft page**: a "Terms" panel above the terms box: offering picker (quotes), Fill terms button,
  a line saying which versions were used ("Company terms v1, HIMARK Growth v1") and "Edited from template" when
  relevant. Issued documents show the same line, read-only.
- **Document sheet / PDF**: service inclusions as a list under the terms, only when present. Terms heading and
  numbering unchanged.
- **Company settings**: the two default boxes are hidden when an approved company template exists, with a link instead.
- Every control does what it says; a disabled control states why.

## Errors

Add to the plain-message map: `TERMS_NOT_DRAFT_DOCUMENT` (document already issued), `TERMS_SOURCE_INVALID`,
`TERMS_MISSING_VALUES` (lists the placeholder names), `TERMS_OFFERING_UNKNOWN`. A failed fill keeps what was typed.

## Testing

**Unit:** offering derivation from engagement and from lines; picker list; fill refuses on `missing`; edited flag;
sources round-trip; view builder shows inclusions and the "used" line; PDF contains inclusions.
**Database (RLS suite):** a member can fill terms on a draft in their own organisation and not in another; issued
documents refuse `set_document_terms`; sources pointing at another organisation's version are refused; invoice from
quote copies sources and wording; issuing freezes sources; changing a template afterwards leaves an issued document and
a filled draft unchanged.
**Walk-through (signed in):** create a quote for a Growth engagement, fill terms, edit one line, send, create the invoice
from it, change the Growth template, and confirm both documents are unchanged.

## Risks

- Re-creating the send and invoice-from-quote functions touches the most sensitive database code in the product;
  the existing document database tests must pass unchanged before the new ones are added.
- Authors may expect Fill terms to keep their edits. It does not; it asks first, and the message says so.
