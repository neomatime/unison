# Commercial Terms on Quotes and Invoices Implementation Plan

**Goal:** Quotes and invoices fill their terms from approved templates for the offerings sold, remember the exact
versions used, and keep that wording after sending. Invoices created from a quote inherit the accepted wording.

**Spec:** `docs/superpowers/specs/2026-10-13-terms-on-documents-design.md` (authority). Build 1 plan
(`2026-10-12-commercial-terms-foundation.md`) holds the global constraints, which apply unchanged: the Supabase project
`unison-uat` is production, so applying migrations and running the RLS suite are **controller-only** steps that need
the user's go-ahead; migrations are append-only (latest: `20261012161000`); explicit `git add` paths only; pure modules
use relative `.ts` imports; unit tests run with `node --test --experimental-strip-types`; typecheck with
`npx tsc --noEmit -p .`.

## Rulings made while planning

1. Placeholder values for a fill come from the **one retainer offering** on the document, if any (a client has one
   active retainer). Project and support offerings contribute wording but no retainer numbers; a line needing a value
   that is absent is `missing` and blocks the fill, as the spec says.
2. `terms_sources` stores camelCase-free snake_case keys (`template_id`, `version_id`, `version`, `layer`); the
   TypeScript side maps from `TermsSource`.
3. The fill is computed in the server action (reusing `resolveTerms`) and written through `set_document_terms`; the
   database validates sources but does not re-resolve wording.
4. For invoices, the picker is not shown; offerings come from the engagement or are copied from the quote.

## Tasks

### Task 1 - Pure document-terms module (no database)
Create `features/terms/document-terms.ts` and `tests/unit/terms-document.test.ts`.
- `offeringsForDocument({ engagement, lines })` -> ordered unique offering keys with kind, from the engagement package
  key, else from locked rate card lines' `rate_key` (`retainer.<key>.monthly`, `project.<key>...`, `support.<key>...`).
- `layersForOfferings(kind, offerings, templates)` -> the targets to load, using `termsTargetsFor` and `appliesToKind`.
- `planFill({ resolved, existingTerms })` -> `{ ok: false, missing }` when placeholders are missing; otherwise the
  terms text (numbered lines are added by the sheet, so plain lines joined by `\n`), the inclusions text and the
  snake_case sources; `needsConfirm` when `existingTerms` is non-blank and differs.
- `sourceSummary(sources, titles)` -> "Company terms v1, HIMARK Growth v1".
- Tests: engagement beats lines, unknown rate keys ignored, order and de-duplication, missing blocks, confirm only
  when something typed, summary text, Windows line endings.

### Task 2 - Migration `20261013100000_document_terms.sql` (write only; controller applies)
- Add `terms_sources jsonb not null default '[]'`, `terms_inclusions text`, `terms_edited boolean not null default
  false`, `terms_offerings text[] not null default '{}'` to `quotes` and `invoices`; checks on offering shape and on
  sources being a JSON array.
- Extend the issued-document immutability triggers in `20261011120000_documents_hardening.sql` (latest definitions are
  in `20261012130000_final_review_fixes.sql` / later fixes: read the newest before editing) so the four columns cannot
  change once the status leaves draft.
- `set_document_terms(p_kind, p_id, p_terms, p_inclusions, p_sources, p_offerings, p_edited)`: security definer, empty
  search path, `is_member_of`, draft-only (`TERMS_NOT_DRAFT_DOCUMENT`), every source `version_id` must belong to the
  organisation and be approved or archived (`TERMS_SOURCE_INVALID`), offerings shape (`TERMS_OFFERING_UNKNOWN`);
  grants to `authenticated` only.
- Re-create `create_invoice_from_quote` (newest body: `20261012120000_billing_documents.sql` line 296, plus later
  fixes) to copy the four columns and the terms text.
- Re-create `send_quote` / `issue_invoice` only if they must change; they already freeze the text. Keep
  `coalesce(default_*_terms)` as the fallback.
- No backfill.

### Task 3 - Queries and actions
- `features/terms/queries/load-document-layers.ts` (server): current approved versions for the targets of Task 1,
  rate values for the retainer, settings numbers; returns `ResolvedLayer[]` + `PlaceholderValues` + template titles.
- `features/terms/actions/document-terms.ts`: `fillDocumentTermsAction`, `saveDocumentOfferingsAction`, calling
  `set_document_terms`; error tokens added to `features/documents/errors.ts` with plain messages.
- Mark `terms_edited` when the document's terms text is saved after a fill (find the existing save path for `terms`).
- Unit source-checks in the style of `documents-actions-source.test.ts`.

### Task 4 - UI
- `features/terms/components/document-terms-panel.tsx`: offering picker (quotes), Fill terms, confirm-before-replace,
  "used" line, "Edited from template"; read-only variant for issued documents. Mount it on the quote and invoice
  detail pages above the terms box.
- `document-view.ts`: add `inclusions: string[]` and `termsUsed: string | null` to `DocumentView`; sheet and PDF
  render inclusions under the terms only when present. Update `documents-view.test.ts`, `documents-pdf.test.ts`.
- Company settings: hide the two default boxes when an approved company template exists; link to Settings >
  Commercial terms.

### Task 5 - Database tests (controller runs)
`tests/integration/rls/document-terms.test.ts`: member fills own-org draft; other org refused; issued refuses;
foreign-org source refused; invoice-from-quote copies; issuing freezes; changing a template leaves documents
unchanged. Extend the fixture cleanup sweep. Existing document RLS tests must pass first, unchanged.

### Task 6 - Review, docs, walk-through
Full unit suite, typecheck, lint. Update `docs/follow-ups.md` (close (a)-(d), record anything deferred), `docs/crm-roadmap.md`,
`docs/architecture.md` if it lists the terms tables. User walk-through as in the spec.

## Order and gates
1 -> 3 -> 4 can proceed without the database. 2 is written early but **applied only after the user approves**, then
3-4 are exercised against it, then 5.
