# Governance completion: Decisions, Approvals, Gates, and the parity leftovers

**Date:** 2026-09-21
**Status:** Awaiting approval
**Origin:** `docs/follow-ups.md`, "From the governance parity slice (2026-09-20)". That slice
shipped Risks and Evidence CRUD and RLS coverage, and deliberately left Decisions, Approvals
and Gates for this one. The user chose the policy below on 2026-09-21.

## Policy (decided by the user)

- **Decisions** get edit and delete, each behind a confirmation on delete.
- **Approvals** can be edited or deleted **only while `Draft`**. Once submitted they move only
  through the existing decide flow in the Approvals module (approve, request changes, reject,
  withdraw). A Draft can also be submitted from its edit form.
- **Approval history is append-only.**
- **Approvals submitted from the project panel write their "Submitted" history row**, as the
  Approvals module already does.

## Scope

**In:**

1. **Database (one migration):**
   - `approval_decisions` becomes append-only: drop its `update` and `delete` policies and revoke
     `UPDATE`, `DELETE` and `TRUNCATE` from `authenticated`. Rows can still disappear through the
     `on delete cascade` from their approval, which is a referential action, not a policy.
   - `approvals` delete is allowed only when `status = 'Draft'` (replace the delete policy).
   - A `before update` trigger on `approvals` refuses changes to `title`, `description`,
     `priority`, `due_date` when the **old** row's status is not `Draft`. The decide flow changes
     only `status` and `decided_at`, so it is unaffected. This makes "Draft only" structural
     rather than a UI convention.
2. **Decisions** (project Governance tab): edit and delete. Fields: title, decision, rationale,
   decided date. `decided_by` is set at creation and never edited.
3. **Approvals** (project Governance tab): edit title, description, priority, due date while
   Draft; **Submit** from the edit form (status `Pending`, `submitted_at` set, "Submitted"
   history row written); delete while Draft. Rows that are not Draft show read-only with no
   edit or delete control. The panel's create-and-submit also writes the history row.
4. **Gates** (Framework page): edit name, description, approval required, evidence required;
   delete behind a confirmation. The phase is not editable. The confirmation says that evidence
   attached to the gate is removed with it, which is true: `governance_artefacts.gate_id`
   cascades.
5. **Leftovers from the parity slice:** accessible labels on every governance form control and a
   named actions column header; the risk register's target date formatted like the evidence
   date; `anon-privileges.test.ts` lists the six Governance tables; the misleading
   `governance-artefacts.test.ts` title fixed.

**Out, and why:**

- **A failed save reverting the typed value** (React resets action-bound uncontrolled forms after
  any completed action). It is one shared pattern across Requirements, Risks and Evidence and
  needs its own fix; it stays in `docs/follow-ups.md`.
- **Narrowing `TRUNCATE` on the other tables**, `isHttpsUrl` hardening, and the
  `auth.users`-referencing person columns. Separate concerns, still recorded.
- **Assigning an approver** and reassign/delegate. Nothing in the product uses `approver_id` yet.
- **Gate enforcement on phase change.** Gates are metadata today; that is a product decision.

## Behaviour details

- Every action is scoped by `organization_id`, reads the row back with `.select()`, and says
  "no longer exists, or is not yours" when nothing matched (the pattern from the parity slice).
- Approval edit and submit act with `.eq('status', 'Draft')`, so an approval that was submitted
  in another tab is reported as not editable instead of being overwritten.
- Submit writes the history row after the update. If the history insert fails the action reports
  it exactly as `recordApprovalDecisionAction` does ("The approval changed, but its decision
  history could not be recorded.").
- Validation: a decision needs title and decision text and a valid ISO date if one is given; an
  approval needs a title and a priority from Low/Medium/High/Critical and a valid due date; a
  gate needs a name. Vocabularies come from `governance-vocabulary.ts`, extended with
  `APPROVAL_PRIORITIES`.

## Testing

- **RLS:** `approval_decisions` UPDATE and DELETE are refused for a member and the todo test
  becomes a real test; deleting a non-Draft approval is refused and a Draft one is allowed;
  editing a non-Draft approval's title is refused with the trigger's message while the decide
  flow's status change still succeeds; the cascade from a deleted Draft approval still removes
  its history.
- **Unit:** form readers for decisions, approvals and gates; source guards that the Approvals
  register shows edit/delete only for Draft rows and that the gate delete confirmation mentions
  evidence.
- Gates: `pnpm typecheck`, `pnpm test`, `pnpm test:rls`, `pnpm build`.
- Then a signed-in walk of the Governance tab and the Framework page, driven by Claude in the
  Browser pane once the user has signed in, with every test row deleted afterwards.

## Global constraints

- `unison-uat` is production: no separate test database; every test row is deleted; RLS
  fixtures are cleaned up including their audit events (the sweep in
  `tests/integration/rls/helpers.ts` already lists the Governance resources).
- Migrations are append-only and this slice adds exactly one; it is applied to production only
  after review and its effect verified with a rollback-probe or `has_table_privilege` and policy
  queries.
- Integrity rules are enforced structurally, not only in the UI.
- A control in the UI is a claim the product supports that capability.
- Secrets live in `.env.local` only.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
