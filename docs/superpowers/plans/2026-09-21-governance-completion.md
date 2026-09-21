# Governance Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decisions and Approvals get edit/delete (Approvals Draft-only, with Submit), Gates get edit/delete, approval history is append-only, and the parity leftovers (labels, date format, anon test list) are closed.

**Architecture:** Same pattern as the parity slice: pure form readers (`governance-fields.ts`) validated in server actions (`project-governance.ts`, `framework-governance.ts`), inline-edit registers as client components, RLS/DB rules proved by integration tests. The database migration `20260921100000_governance_completion.sql` is ALREADY WRITTEN, APPLIED to production and committed (786cb74). No task adds or edits a migration.

**Tech Stack:** Next.js 16 App Router (server actions, `useActionState`), React 19, Supabase Postgres RLS, `node --test` with `--experimental-strip-types`, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-21-governance-completion-design.md`

## Global Constraints

- `unison-uat` is production: no separate test database. Every test row must be deleted; RLS fixtures are cleaned up by `cleanup()` including their audit events. `tests/integration/rls/helpers.ts` already sweeps every Governance resource; do not weaken it.
- Migrations are append-only. This plan adds NONE. Never edit `20260921100000_governance_completion.sql`.
- Integrity rules are enforced structurally, not only in the UI. A control in the UI is a claim the product supports that capability.
- Secrets live in `.env.local` only; never print or commit them.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
- Never `git add -A`, `git checkout .`, `git restore .`, `git stash`, `git clean`. Stage files by explicit path.
- Every task that adds or changes `.ts`/`.tsx` MUST run `pnpm typecheck` (exit 0) and `pnpm test` before committing: `node --experimental-strip-types` does no type checking and tests are inside tsconfig.
- `'use server'` files export only async functions and types. A function imported from a `'use client'` module must never be called from a server component. `next build` does not render dynamic routes, so do not treat it as proof of runtime behaviour.
- Relative imports only in files imported by unit tests (`governance-fields.ts`, `governance-vocabulary.ts`): Node's test runner cannot resolve `@/`.
- Files use CRLF in the working tree on this Windows checkout; do not rewrite whole files' line endings. Make edits with the Edit tool, not by regenerating files.
- Follow the existing register pattern exactly: `features/delivery/components/project-evidence-register.tsx` is the template (inline edit row via `editingId`, edit form closes on `state?.success` through `useEffect`, delete via `window.confirm` in `onSubmit` with `event.preventDefault()`).

## File map

- Modify `features/delivery/governance-vocabulary.ts`: add `APPROVAL_PRIORITIES`.
- Modify `features/delivery/governance-fields.ts`: add `readDecisionFields`, `readApprovalFields`, `readGateFields`.
- Modify `features/delivery/actions/project-governance.ts`: decision + approval actions.
- Modify `features/delivery/actions/framework-governance.ts`: gate update/delete, create via reader.
- Modify `features/delivery/queries/get-project-governance.ts`: approvals select adds `description`.
- Create `features/delivery/components/project-decisions-register.tsx`, `project-approvals-register.tsx`.
- Modify `features/delivery/components/project-governance-panel.tsx`, `framework-governance.tsx`, `governance-form-parts.tsx`, `project-risks-register.tsx`, `project-evidence-register.tsx`.
- Tests: `tests/integration/rls/governance-registers.test.ts`, `governance-artefacts.test.ts`, `anon-privileges.test.ts`; `tests/unit/governance-vocabulary.test.ts`, `governance-fields.test.ts`, `ui-completeness.test.ts`.
- Modify `docs/follow-ups.md`.

---

### Task 1: RLS tests for the new database rules, anon coverage

**Files:**
- Modify: `tests/integration/rls/governance-registers.test.ts`
- Modify: `tests/integration/rls/governance-artefacts.test.ts` (test title at ~line 121 only)
- Modify: `tests/integration/rls/anon-privileges.test.ts`

**Interfaces:** Consumes the applied migration (append-only `approval_decisions`; `approvals_delete` policy requires `status = 'Draft'`; `approvals_lock_content` trigger raises SQLSTATE `23514` with message beginning `approvals_content_locked`). Produces nothing later tasks import.

- [ ] **Step 1: Replace the `todo` append-only test** (`approval history is append-only`, ~line 404) with a real test. A member's UPDATE must fail with `42501` (`permission denied for table approval_decisions`) and DELETE must fail with `42501`; then, with admin, confirm the row is unchanged (`comment` still `null`) and still exists. Assert the specific code, not merely "some error". Remove the `{ todo: ... }` option and the stale comment block above it.
- [ ] **Step 2: Fix the existing member test** `approvals: a member can read, write, update and delete` (~line 272). It currently moves the approval to `Pending` and then deletes it, which the new rule forbids. Change it to: create (Draft), update `title` only, assert the new title, delete while still Draft. Keep it green.
- [ ] **Step 3: Add these new tests** in the approvals section (use the file's existing `approval()` helper, `member`/`outsider` fixtures, and `signedInClient`; clean every row you create in `try/finally` via `admin`):
  1. `approvals: a member cannot delete an approval once submitted`: admin inserts an approval with `status: 'Pending'`; member DELETE `.select('id')` returns `error === null` and `data` `[]` (RLS filters it), and admin confirms the row still exists. (Policy `USING` yields zero rows, not an error.)
  2. `approvals: a member can delete a Draft approval` (covered by Step 2; do not duplicate; only add if Step 2 does not assert row gone via admin).
  3. `approvals: a submitted approval's content is locked`: admin inserts `Pending`; member UPDATE `{ title: 'Changed' }` returns `error.code === '23514'` and `error.message` matches `/approvals_content_locked/`; admin confirms title unchanged. Repeat for `priority`, `description`, `due_date` using `test.each`-style loop over `[['title','Changed'],['description','Changed'],['priority','High'],['due_date','2030-01-01']]` (pick a priority different from the seeded one).
  4. `approvals: the decide flow can still change status of a submitted approval`: admin inserts `Pending`; member UPDATE `{ status: 'Approved', decided_at: <iso now> }` succeeds (`error === null`, one row, status `Approved`).
  5. `approvals: a Draft can be edited and submitted in one update`: admin inserts Draft; member UPDATE `{ title: 'Edited', status: 'Pending', submitted_at: <iso now> }` succeeds.
  6. `approval history: deleting a Draft approval still cascades its history`: admin inserts Draft approval + one `approval_decisions` row; member deletes the approval; admin confirms zero history rows remain for that approval id.
- [ ] **Step 4:** In `governance-artefacts.test.ts`, change the outsider test title `an outsider can neither read, write nor delete` to `an outsider can neither read, write, update nor delete` (it asserts UPDATE too).
- [ ] **Step 5:** In `anon-privileges.test.ts`, add `project_risks`, `project_decisions`, `approvals`, `approval_decisions`, `governance_artefacts`, `governance_gates` to its `TABLES` array using the file's existing shape and assertion style (read the file first; keep its `permission denied for table <name>` tightening).
- [ ] **Step 6: Run.** `pnpm typecheck` exit 0. `node --experimental-strip-types --test tests/integration/rls/governance-registers.test.ts tests/integration/rls/governance-artefacts.test.ts tests/integration/rls/anon-privileges.test.ts` (check `package.json` `test:rls` for the exact runner flags and env loading; use the same). Expected: 0 fail, 0 todo. Then confirm nothing leaked into production with a read-only SQL query: no organizations named like the fixtures remain and no `audit_events` with `organization_id is null` and `resource in ('approvals','approval_decisions','project_decisions','governance_gates','project_risks','governance_artefacts')`.
- [ ] **Step 7: Commit** the three test files by path: `test(governance): RLS coverage for append-only approval history, Draft-only delete and locked content`.

---

### Task 2: Vocabulary and form readers

**Files:**
- Modify: `features/delivery/governance-vocabulary.ts`, `features/delivery/governance-fields.ts`
- Modify: `tests/unit/governance-vocabulary.test.ts`, `tests/unit/governance-fields.test.ts`

**Interfaces:**
- Produces (used by Task 3): `APPROVAL_PRIORITIES`, and from `governance-fields.ts`:
  - `type DecisionFields = { title: string; decision: string; rationale: string | null; decided_at: string | null }`; `readDecisionFields(form: FormData): DecisionFields | { error: string }` (fields `title`, `decision`, `rationale`, `decidedAt`).
  - `type ApprovalFields = { title: string; description: string | null; priority: string; due_date: string | null }`; `readApprovalFields(form): ApprovalFields | { error: string }` (fields `title`, `description`, `priority`, `dueDate`).
  - `type GateFields = { name: string; description: string | null; approval_required: boolean; evidence_required: boolean }`; `readGateFields(form): GateFields | { error: string }` (fields `name`, `description`, checkboxes `approvalRequired`, `evidenceRequired` read as `=== 'on'`).

- [ ] **Step 1: Failing tests first.** Add to `tests/unit/governance-fields.test.ts` (match the file's existing `form()` helper and style), then run and watch them fail:
  - decisions: title required (`'A decision title is required.'`), decision text required (`'The decision text is required.'`), invalid `decidedAt` refused (`'Enter a valid decision date.'`), blank `decidedAt` gives `decided_at: null`, blank rationale gives `null`, values trimmed.
  - approvals: title required (`'An approval title is required.'`), priority must be one of `APPROVAL_PRIORITIES` with no default (`'Choose a valid priority.'`), invalid `dueDate` refused (`'Enter a valid due date.'`), blank due date and description give `null`, `' High '` trimmed is accepted, `'high'` (case) refused.
  - gates: name required (`'A gate name is required.'`), unchecked box gives `false`, `'on'` gives `true`, blank description `null`.
- [ ] **Step 2: Implement.** `governance-vocabulary.ts`: `/** Matches approvals_priority_check. */ export const APPROVAL_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const`. Readers follow `readRiskFields`' style (private `value`/`optional`/`isOneOf`; `isValidIsoDate` from `./schemas/date.ts`; relative imports only). Messages exactly as listed above.
- [ ] **Step 3: Drift test.** In `tests/unit/governance-vocabulary.test.ts` add a test that `APPROVAL_PRIORITIES` equals the `approvals` priority check in the same migration (`create table public.approvals ( ... )`; the column line is `priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical'))`). Generalise the existing `block`/`constraintValues` helper to take the table name rather than duplicating it. Prove it bites: temporarily change one string in the constant, watch it fail, restore.
- [ ] **Step 4: Run** `pnpm typecheck` (exit 0) and `pnpm test` (all pass). **Commit:** `feat(governance): approval priority vocabulary and decision, approval and gate form readers`.

---

### Task 3: Server actions and query

**Files:**
- Modify: `features/delivery/actions/project-governance.ts`, `features/delivery/actions/framework-governance.ts`, `features/delivery/queries/get-project-governance.ts`

**Interfaces:**
- Consumes Task 2's readers. `GovernanceActionState = { error?: string; success?: string }` already exported (type only) from `project-governance.ts`.
- Produces (used by Tasks 4 and 5), all `(id, _previous: GovernanceActionState | undefined, form: FormData) => Promise<GovernanceActionState>` shaped for `.bind(null, id)`:
  - `updateDecisionAction(decisionId, ...)`, `deleteDecisionAction(decisionId, ...)`, `updateApprovalAction(approvalId, ...)`, `deleteApprovalAction(approvalId, ...)` in `project-governance.ts`.
  - `updateGovernanceGateAction(gateId, ...)`, `deleteGovernanceGateAction(gateId, ...)` in `framework-governance.ts`.
- `ProjectGovernance["approvals"][number]` gains `description: string | null`.

Follow the existing update/delete actions in `project-governance.ts` (`updateRiskAction`/`deleteRiskAction`) exactly: validate uuid, read via the reader, `getSessionContext()`, scope every write with `.eq("organization_id", organization.id)`, read back with `.select(...)`, `revalidatePath` from the DB-returned `project_id`/`framework_id`. `error` and "matched nothing" get different messages.

- [ ] **Step 1: Decisions.** `createDecisionAction` switches to `readDecisionFields` (`decided_at` defaults to `new Date().toISOString().slice(0, 10)` when `null`; `decided_by` stays `ctx.user.id`). `updateDecisionAction`: reader; `decided_at === null` returns `{ error: 'Enter a valid decision date.' }`; update `{title, decision, rationale, decided_at}` (never `decided_by`); `.select("project_id").maybeSingle()`; error message `"The decision could not be updated."`, none matched `"That decision no longer exists, or is not yours."`; success `"Decision updated."`. `deleteDecisionAction`: `.delete().select("id, project_id")`; not found `"That decision no longer exists, or is not yours."`; success `"Decision removed."`.
- [ ] **Step 2: Approvals create.** `createApprovalAction` uses `readApprovalFields` (the form must now post `priority`; the reader has no default). Insert with `.select("id").single()`. When `submit`, insert the history row `{ organization_id, approval_id: data.id, action: "Submitted", actor_id: ctx.user.id }`; on failure return `{ error: "The approval was created, but its decision history could not be recorded." }` (mirror `recordApprovalDecisionAction`). Existing revalidation and success strings unchanged.
- [ ] **Step 3: Approvals update.** `updateApprovalAction(approvalId, _prev, form)`: uuid check (`"That approval is invalid."`), `readApprovalFields`, `submit = String(form.get("intent") ?? "") === "submit"`. Update `{...fields, ...(submit ? { status: "Pending", submitted_at: new Date().toISOString() } : {})}` with `.eq("id", approvalId).eq("organization_id", organization.id).eq("status", "Draft").select("project_id").maybeSingle()`. `error` -> `"The approval could not be updated."`; no row -> `"That approval is no longer a Draft, or no longer exists."`. If `submit`, insert the `Submitted` history row (same shape and same failure text as Step 2 but starting `"The approval changed, but its decision history could not be recorded."`). Revalidate `/operations/projects/${data.project_id}` (guard for null) and `/delivery/approvals`. Success `submit ? "Approval submitted." : "Draft saved."`.
- [ ] **Step 4: Approvals delete.** `deleteApprovalAction`: `.delete().eq("id", ...).eq("organization_id", ...).eq("status", "Draft").select("id, project_id")`; nothing -> `"That approval no longer exists, is not a Draft, or is not yours."`; success `"Draft removed."`; revalidate the project page (if `project_id`) and `/delivery/approvals`.
- [ ] **Step 5: Gates.** In `framework-governance.ts`: `createGovernanceGateAction` uses `readGateFields` for name/description/booleans (keep its phase check and its `23505` message). Add `updateGovernanceGateAction(gateId, _prev, form)` (uuid; reader; update the four fields only, never `phase_id`; `.select("framework_id").maybeSingle()`; `23505` -> `"That phase already has a gate with this name."`; other error `"The governance gate could not be updated."`; none -> `"That gate no longer exists, or is not yours."`; revalidate `/delivery/frameworks/${data.framework_id}`; success `"Governance gate updated."`) and `deleteGovernanceGateAction(gateId, ...)` (`.delete().select("id, framework_id")`, `"That gate no longer exists, or is not yours."`, success `"Governance gate removed."`, revalidate). Both need the same `{ error?: string; success?: string }` state type as create.
- [ ] **Step 6: Query.** `get-project-governance.ts`: add `description` to the approvals `select` and to the `approvals` type.
- [ ] **Step 7: Run** `pnpm typecheck` exit 0, `pnpm test` all pass, `pnpm build` exit 0. Note: this task leaves the old panel forms compiling but the approval add form does not yet post `priority` correctly if it lacked one: the existing select already posts `priority`; confirm. **Commit:** `feat(governance): decision, approval and gate update and delete actions; submit writes history`.

---

### Task 4: Decisions and Approvals registers, panel rewiring

**Files:**
- Create: `features/delivery/components/project-decisions-register.tsx`, `features/delivery/components/project-approvals-register.tsx`
- Modify: `features/delivery/components/project-governance-panel.tsx`, `features/delivery/components/governance-form-parts.tsx`
- Modify: `tests/unit/ui-completeness.test.ts` (append guards)

**Interfaces:**
- Consumes Task 3's actions and `ProjectGovernance["decisions" | "approvals"]`.
- Produces: `ProjectDecisionsRegister({ projectId, decisions })`, `ProjectApprovalsRegister({ projectId, approvals })`; `formatDate(iso: string): string` in `governance-form-parts.tsx` (no directive) returning `new Date(\`${iso}T00:00:00\`).toLocaleDateString("en-ZA")` for a `YYYY-MM-DD` string.

Both new files are `"use client"`, follow the evidence register's structure, and include an `aria-label` on EVERY `<input>`, `<select>` and `<textarea>` (matching its placeholder text, e.g. `aria-label="Decision title"`) and `<th><span className="sr-only">Actions</span></th>` for the actions column.

- [ ] **Step 1: `ProjectDecisionsRegister`.** Table columns Decision, Outcome, Date (via `formatDate(row.decided_at)`), actions. Row shows `title`, `decision`. Edit form fields: `title` (required), `decidedAt` (`type="date"`, required, `defaultValue={row.decided_at}`), `decision` textarea (required), `rationale` textarea. Add form: same fields as the current `DecisionRegister` form (title, decidedAt, decision, rationale) plus labels, button "Record decision". Delete: `window.confirm(\`Delete the decision "${decision.title}"? This cannot be undone.\`)`, action `deleteDecisionAction`, button "Remove". Card title "Decision register", description "What was decided, when, and why" (unchanged).
- [ ] **Step 2: `ProjectApprovalsRegister`.** Table columns Approval, Priority, Due (`due_date ? formatDate : "—"`), Status, actions. **Actions render only when `approval.status === "Draft"`** (Edit + Remove); other rows have an empty actions cell. Edit form fields: `title` (required), `priority` select over `APPROVAL_PRIORITIES` (`defaultValue={approval.priority}`), `description` textarea (`defaultValue={approval.description ?? ""}`), `dueDate` date (`defaultValue={approval.due_date ?? ""}`), and two submit buttons named `intent`: `value="draft"` "Save draft" and `value="submit"` "Submit". Add form keeps the current approval form (title, priority select over `APPROVAL_PRIORITIES`, description, dueDate, Save draft / Submit buttons named `intent`). Delete: `window.confirm(\`Delete the draft "${approval.title}"? This cannot be undone.\`)` with `deleteApprovalAction`. Card title "Governance approvals", description unchanged: "Controlled gate and project decisions with durable status history".
- [ ] **Step 3: Panel.** In `project-governance-panel.tsx` render `ProjectApprovalsRegister` for "Gates & approvals" and `ProjectDecisionsRegister` for "Decisions"; delete the now-unused `ApprovalRegister`, `DecisionRegister`, `Register` and every import that becomes unused (`createApprovalAction`, `createDecisionAction`, `useActionState`, `SectionCard`, `area`, `Feedback`, `input` as applicable). The panel keeps its tab state, the Risks and Evidence branches and the `members` prop untouched.
- [ ] **Step 4: Guards** in `tests/unit/ui-completeness.test.ts` (match that file's `readFileSync(join(workspace, ...))` style; anchor regexes to call sites, not bare names):
  - the approvals register renders `deleteApprovalAction`/edit controls only under a `status === "Draft"` condition (assert the file contains `approval.status === "Draft"` AND that `deleteApprovalAction` appears only after it in source order, or use a regex that ties them);
  - the approvals delete confirm mentions `draft`: `/window\.confirm\(\s*`[^`]*draft/i`;
  - the decisions delete confirm names the decision: `/window\.confirm\(\s*`[^`]*decision/`.
  Prove each guard bites by temporarily breaking the source, then restore byte-identical (`git diff` empty for that file).
- [ ] **Step 5: Run** `pnpm typecheck` exit 0, `pnpm test` all pass, `pnpm build` exit 0. Render both registers with `react-dom/server` in a scratch harness (scratchpad directory only, transpile the real source, stub only the actions module and `SectionCard`): list with a Draft and a Pending approval (Pending row has no Edit/Remove), empty state, edit state, hostile characters escaped, null description/due date render without the literal "null". **Commit** the two new files, the panel, `governance-form-parts.tsx` and the test: `feat(governance): decisions and approvals registers with edit, delete and submit`.

---

### Task 5: Gates edit and delete on the Framework page

**Files:**
- Modify: `features/delivery/components/framework-governance.tsx`
- Modify: `tests/unit/ui-completeness.test.ts` (one guard)

**Interfaces:** Consumes `updateGovernanceGateAction`, `deleteGovernanceGateAction` (Task 3) and `FrameworkDetail["gates"]` items `{ id, name, description, phaseName, approvalRequired, evidenceRequired }` (see `features/delivery/queries/get-framework.ts`; read the exact mapped property names before coding).

- [ ] **Step 1:** Keep `FrameworkGates` as the exported component (its file keeps `"use client"`). Each gate row gets Edit and Remove; Edit replaces the row with an inline form (`name` required, `description` textarea, checkboxes `approvalRequired`/`evidenceRequired` with `defaultChecked`), Save/Cancel, closing on `state?.success` via `useEffect` (same pattern as the evidence register). The phase is displayed but not editable. Every control has an `aria-label`.
- [ ] **Step 2:** Remove confirmation text exactly: `Remove the gate "${gate.name}"? This cannot be undone, and any evidence attached to this gate is removed too.` (true: `governance_artefacts.gate_id` cascades).
- [ ] **Step 3: Guard** in `ui-completeness.test.ts`: `framework-governance.tsx` contains `/window\.confirm\(\s*`[^`]*any evidence attached to this gate is removed too/`. Prove it bites and restore byte-identical.
- [ ] **Step 4: Run** `pnpm typecheck`, `pnpm test`, `pnpm build`. Render `FrameworkGates` via `react-dom/server` in a scratch harness with a stubbed actions module: two gates (one advisory), edit state, empty state. **Commit:** `feat(governance): edit and remove framework gates`.

---

### Task 6: Labels and dates on the parity registers, follow-ups

**Files:**
- Modify: `features/delivery/components/project-risks-register.tsx`, `project-evidence-register.tsx`
- Modify: `docs/follow-ups.md`

- [ ] **Step 1:** Risks register: an `aria-label` on every `<input>`, `<select>`, `<textarea>` in the add and edit forms (probability, impact, status, owner, title, description, mitigation, target date), the actions `<th />` becomes `<th className="px-4 py-3"><span className="sr-only">Actions</span></th>`, and the Target date column renders `formatDate(risk.target_date)` (import from `./governance-form-parts`) with `"—"` when null. Evidence register: `aria-label` on its inputs and textareas (add and edit) and the same named actions header.
- [ ] **Step 2:** `docs/follow-ups.md`: in the section "From the governance parity slice (2026-09-20)" mark closed items (Decisions/Approvals create-only, approval history append-only, panel submit writes no history, gates edit/delete, unlabeled selects, anon-privileges list) by removing them and add a new section "From the governance completion slice (2026-09-21)" listing what remains and anything the reviews found: at minimum the failed-save form reset, `TRUNCATE` on the other tables, `isHttpsUrl` hardening, `auth.users` person columns (`requested_by`, `actor_id`, `uploaded_by`), approver assignment and reassign/delegate not built, gate enforcement on phase change not built, approval edit only locked by trigger for four content columns, `approvals_delete` Draft-only means `on delete cascade` from a project still removes non-Draft approvals. Do not remove bullets that are still true.
- [ ] **Step 3: Run** `pnpm typecheck`, `pnpm test`, `pnpm build`. **Commit** the two components and the doc: `feat(governance): labels and formatted dates on risks and evidence; update follow-ups`.
