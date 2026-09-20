# Governance parity: Risks and Evidence, and RLS coverage

**Date:** 2026-09-20
**Status:** Approved, ready for planning
**Origin:** `docs/follow-ups.md`, "Final review of feat/requirements (2026-09-12)": Governance
is create-only with no RLS coverage, while Requirements has full CRUD, an owner picker and
an RLS suite. That inconsistency was decided deliberately when Requirements shipped and
recorded as worth a later pass. This is that pass, cut into a first slice.

## Why

The project's Governance tab has four registers (Gates & approvals, Risks, Decisions,
Evidence). Each can create a record and nothing else: no edit, no delete, no owner. The
database already grants full CRUD row-level security on all of them, so the UI is the
thing holding them back.

Two of the gaps are worse than "missing buttons":

- **A risk's status can never move.** `createRiskAction` hard-codes `status: "Open"`, and the
  table allows Open, Mitigating, Accepted and Closed. Three of the four values are
  unreachable. Requirements' spec called this out as "a status lifecycle that can never move
  is decorative, not a feature."
- **`project_risks.owner_id` exists and nothing sets it.** Requirements ships an owner picker
  with removed-owner retention; the risk register has no way to assign anyone.

And none of the Governance tables has a single RLS test. `project_risks`, `project_decisions`,
`approvals`, `approval_decisions`, `governance_artefacts` and `governance_gates` all ship with
policies and nothing proving any of them isolates tenants. The history-trigger defect fixed
on 2026-09-20 (every framework edit and phase change refused with 42501, both history tables
empty forever) sat in exactly this kind of untested corner.

## Scope

**In, this slice:**

- **RLS test coverage for all six Governance tables**, in the style of
  `tests/integration/rls/requirements.test.ts`. Tests come first and may surface real
  database defects, which are then fixed in this slice.
- **Risks:** full CRUD across all eight stored fields, an owner picker with removed-owner
  retention, and a status that can move.
- **Evidence:** edit and delete.

**Out, and why:**

- **Decisions and Approvals.** These need a behaviour decision, not just a form, and are
  their own slice afterwards. Open questions for that slice: whether a recorded decision may
  be edited or deleted at all (it is a log; the audit trigger records changes but the
  register's credibility is a policy question), whether an approval may be edited only while
  Draft, whether only Drafts may be deleted (with Withdraw for the rest), and how an
  approver is assigned. Approvals also already have a real decide flow in the Approvals
  module (`recordApprovalDecisionAction`, approve / request changes / reject / withdraw, each
  writing an `approval_decisions` history row).
- **A known defect, recorded for that slice rather than fixed here:** the project panel's
  `createApprovalAction` writes an approval with status Pending but, unlike
  `createStandaloneApprovalAction` in the Approvals module, never writes the "Submitted"
  `approval_decisions` row. Approvals submitted from the panel start with no history, though
  the register's own description promises "durable status history".
- **Gates management.** `governance_gates` gets RLS tests only. No gate UI is built.
- **Evidence scoped to a framework or an approval.** The panel only ever creates
  project-scoped evidence and that stays true.
- **File upload for evidence,** risk-severity scoring, and any briefing representation.
  Requirements made the same cuts.

## Behaviour

### Risks

All eight stored fields are on the form and nothing else: title, description, probability,
impact, status, owner, mitigation, target date. A field in the UI is a claim that the
product supports that capability.

- **Vocabularies** are exactly the database's check constraints: probability Rare / Unlikely /
  Possible / Likely / Almost Certain; impact Minor / Moderate / Major / Severe; status Open /
  Mitigating / Accepted / Closed.
- **Status moves freely** between any two values, with no transition rules. Every status
  field in this schema behaves this way (delivery items, requirements); inventing a workflow
  engine for one entity would be new complexity with no precedent and no stated need.
- **Owner picker uses `selectOwnerOptions`** from `features/delivery/form-options.ts`, with
  the retention rule from day one: on edit, the current owner appears even if since removed
  from the organisation, so saving never silently overwrites the recorded owner with the
  first option. Owner, client, phase, framework and delivery items were the first five
  places this defect class was found and fixed, and Requirements the sixth; this is the seventh.
- **The add form gains status (default Open) and owner (default Unassigned).**
- **The register gains Owner and Target date columns.** A removed owner displays as "Former
  member", never blank.
- **Delete is a hard delete** behind a `window.confirm` naming the risk and saying it cannot
  be undone, matching Requirements. `project_risks` has no `archived_at`, and `Closed` is
  the lifecycle end; deletion is for records made by mistake.

### Evidence

- **Edit** name, HTTPS URL and notes. The URL keeps the rule `createArtefactAction` already
  enforces: it must parse and be `https:`.
- **Delete** behind a `window.confirm` that names the item, says it cannot be undone, and
  says any requirement links to it are removed too. That last clause is true:
  `requirement_evidence` cascades from `governance_artefacts`, and
  `tests/integration/rls/traceability.test.ts` proves it.
- Rows stay project-scoped. `uploaded_by` is set at creation and never edited.

## Architecture

`Register` in `project-governance-panel.tsx` renders read-only rows with no way to replace a
row by a form, so Risks and Evidence get their own tables with an inline edit row, the same
way `project-requirements-panel.tsx` does. Approvals and Decisions keep `Register`.

- **New:** `features/delivery/components/project-risks-register.tsx`,
  `project-evidence-register.tsx`, and one small `governance-form-parts.tsx` for the feedback
  message and input styles they share with the panel. Requirements is deliberately not moved
  onto it: it shipped and was checked in the app, and reopening it is not this slice's job.
- **New:** `features/delivery/governance-vocabulary.ts`, a plain module with no directive,
  exporting `RISK_PROBABILITIES`, `RISK_IMPACTS` and `RISK_STATUSES`. Both the server actions
  and the client form import it. (Requirements had to restate its lists in the client file
  because a `'use server'` file cannot export non-function values across the boundary.)
- **Changed:** `features/delivery/actions/project-governance.ts` gains `updateRiskAction`,
  `deleteRiskAction`, `updateArtefactAction` and `deleteArtefactAction`, and
  `createRiskAction` starts validating its enums and owner instead of defaulting silently.
  Each write is scoped by `organization_id` and reads the row back with `.select()`, so a
  wrong or foreign id is reported as an error and not as a success; delete says "no longer
  exists" when nothing matched.
- **Changed:** `features/delivery/queries/get-project-governance.ts` selects `owner_id` for
  risks and resolves an owner name per row (`Unassigned`, the member's name, or
  `Former member`), the rule `list-requirements.ts` uses.
- **Changed:** `app/(unison)/operations/projects/[projectId]/page.tsx` already loads the
  organisation's members; `project-detail-screen.tsx` forwards that raw list to
  `ProjectGovernancePanel` and on to the risk register. It must stay the raw,
  unfiltered `OrganizationMember[]`: `selectOwnerOptions` filters and retains internally, and
  pre-filtering would leave it nothing to retain against.
- **The edit form closes itself on a successful save.** React resets an action-bound form's
  uncontrolled fields after success, and a form left open then shows the pre-edit value. This
  is the defect found in Requirements' status field, and `EditRequirementForm` carries the fix
  with a `useEffect` on `state.success`.

## Testing

**RLS tests** under `tests/integration/rls/`, each asserting the specific constraint name and
not only a SQLSTATE:

- `project-risks.test.ts` and `governance-artefacts.test.ts`, each the full Requirements
  matrix: a cross-tenant project is unrepresentable, an owner outside the organisation is
  refused (risks), an invalid enum is refused, an outsider can neither read, write nor delete,
  a member can read, write and delete, and removing a member sets the owner column to null
  rather than orphaning the row. Evidence additionally pins its shape checks: it needs a
  stored file or an external URL, and a project, framework or approval scope.
- `governance-registers.test.ts`, one shared file for `project_decisions`, `approvals`,
  `approval_decisions` and `governance_gates`, with the core isolation set for each:
  cross-tenant refusal, outsider blocked, member can act, and the member-reference columns
  (`decided_by`, `approver_id`, `assignee_id`) refused for a non-member and nulled on member
  removal.
- **`tests/integration/rls/helpers.ts`'s audit-event sweep must list all six resource names.**
  These tables carry `record_audit_event` triggers, and the cleanup deletes only audit rows it
  can trace by resource. Requirements missed this once and leaked 24 orphaned `audit_events`
  rows into production.

**Unit tests:**

- A drift test reads the risk check constraints out of
  `supabase/migrations/20260910130104_core_delivery_governance.sql` and asserts they equal
  `governance-vocabulary.ts`, so the form cannot offer a value the database refuses.
- A source guard requires the risk edit form to call `selectOwnerOptions(members, ...)` with
  the current owner as its second argument. A bare-name match is not enough: it would also be
  satisfied by the add form's zero-argument call. (The guard for Requirements had to be
  strengthened for exactly this reason.)

## Error handling

Values are validated before the database and refused with a plain message naming the field.
Anything the database can still refuse after that (an owner from another organisation, a
project that is not the caller's) returns one generic message per action, as Requirements
does. Editing or deleting a record that no longer exists, or is not the caller's, says so.

## Success criteria

A PM can edit a risk, move its status through all four values, reassign its owner, and delete
it. A removed owner still shows on the risk as "Former member" and stays in the edit
picker. A PM can edit and delete evidence, and the delete says it also removes requirement
links. Every Governance table has RLS coverage. `pnpm typecheck`, `pnpm test`,
`pnpm test:rls` and `pnpm build` are green from a clean tree.

Then, signed in against the running app, the Governance tab has been walked by a person,
including opening every edit form and the evidence delete confirmation. Typecheck, unit
tests, `next build` and independent review all passed on the Integrations slice while its
detail page threw on every request; only a render caught it.

## Global constraints

- A field or control in the UI is a claim the product supports that capability; this slice
  claims exactly the eight risk fields and three evidence fields.
- The picker-retention rule applies to the risk owner picker from day one, and the raw member
  list is never pre-filtered on its way there.
- Integrity rules are enforced structurally, not only in the UI.
- `unison-uat` is production: there is no separate database. Any test row must be deleted, and
  test fixtures must be cleaned up by `cleanup()` including their audit events.
- Migrations are append-only; never edit one that has been applied.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
