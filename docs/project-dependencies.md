# Requirement: Project Prerequisites and Dependencies

**Domain:** Projects / Delivery
**Status:** Formal requirement, agreed 2026-09-03. Not yet built.
**Sequenced:** after the Projects write path. See Sequencing.

## Purpose

A Project Manager must be able to declare that one project is a prerequisite of
another, so cross-project dependencies are explicit rather than tracked by hand
in Excel, email, meetings and status reports.

> Project B may depend on Project A reaching a defined state before Project B
> can proceed.

```
Customer Data Migration
  → prerequisite for → Digital Claims Platform
      → prerequisite for → Claims Mobile App
```

The value is not recording a dependency. It is making **downstream project risk
visible and governable across the portfolio**.

## 1. Core capability

A PM can create a relationship between a **prerequisite project** and a
**dependent project**. The first version ships one relationship type:

**Prerequisite** — the dependent project cannot progress beyond the defined
point until the prerequisite project reaches the required state.

## 2. Fields

Prerequisite project, dependent project, relationship type, required state,
dependency owner, criticality, required/target date, status, notes.

Required states align with project and framework states that already exist —
started, a specific framework phase reached, ready, deployed, completed. **Do
not overbuild the required-state model in the first implementation.**

## 3. Dependency status

Derived or displayed as Pending, Satisfied, At Risk, or Blocked. **The UI must
make the reason for a blocked state visible.**

> Claims Mobile App — **Blocked**
> Digital Claims Platform prerequisite has not reached Completed.

## 4. Project-level visibility

The project detail page shows both directions: projects this one depends on,
and projects that depend on it — with status, required state, owner, target
date and whether the dependency is critical.

## 5. Portfolio visibility

Dependencies are visible at portfolio level, so a user can see where one project
creates downstream delivery risk.

```
Customer Data Migration    At Risk
  ↓
Digital Claims Platform    At Risk
  ↓
Claims Mobile App          Blocked
```

A dependency-chain or map view is the eventual goal. **A complex visual graph is
not required for the first version.**

## 6. Structural integrity rules

Enforced structurally, not only in the UI.

- **Same tenant.** A project may only reference projects in its own
  organisation. Cross-tenant dependencies must be impossible.
- **No self-dependency.** A project cannot be its own prerequisite.
- **No cycles.** `A → B, B → A` and `A → B, B → C, C → A` are both rejected.
  Creation must fail if it would introduce a cycle.

## 7. Product boundary

Project-to-project governance only. UNISON answers *"what other projects could
prevent this project from succeeding?"* It does not replace Jira or Azure DevOps
dependency handling between stories, tasks, commits or sprint items.

## 8. Future relationship types

Model so further types can be added without rebuilding: Dependency, Related
Project, Successor/Predecessor, Shared Deliverable. **Do not expose them in the
first implementation without validated demand.** Start with Prerequisite.

The eventual distinction: a **prerequisite** blocks progress until satisfied; a
**dependency** is a reliance under which work may still continue.

## 9. UX

Project → Dependencies → Add Dependency. Fields: relationship type,
prerequisite project, required state, criticality, owner, required-by date,
optional notes.

Validate before saving: same tenant, not self, not a duplicate, and does not
introduce a cycle.

## 10. Sequencing

1. Projects write path
2. Delivery Items
3. **Project Prerequisites / Dependencies**
4. Requirements
5. Traceability
6. Azure DevOps / Jira integration

Moving this after Requirements is acceptable; it must remain core Delivery.

---

# Implementation notes for the spec

*Added by the engineering side. These are consequences of the requirement above,
not changes to it. Each is a decision the spec must make explicitly.*

### Two of the three integrity rules are declarative; the third is not

Same-tenant and no-self-dependency are cheap and follow patterns already in the
schema:

- same tenant — a composite foreign key on `(project_id, organization_id)`
  against `projects (id, organization_id)`, for both sides. This is the pattern
  `projects` already uses for `client_id` and `framework_id`, and it makes a
  cross-tenant reference unrepresentable rather than merely rejected.
- no self-dependency — `check (prerequisite_project_id <> dependent_project_id)`
- no duplicates — a unique index on
  `(organization_id, dependent_project_id, prerequisite_project_id, relationship_type)`

**Cycle prevention cannot be a constraint.** Postgres has no declarative way to
forbid a cycle in a self-referencing edge table. It needs a `before insert or
update` trigger running a recursive CTE from the new dependent back through its
prerequisites, raising if it reaches the prerequisite being added.

That trigger has a **concurrency hole worth deciding on deliberately**: two
transactions can each insert an edge that is individually acyclic but jointly
forms a cycle, because neither sees the other's uncommitted row. The fixes are
`serializable` isolation on that path, or an advisory lock keyed on the
organisation for the duration of the write. The second is cheaper and scoped —
dependency edits are rare, and the lock is per tenant. The spec should pick one
and say why; without it the rule holds under testing and fails under two PMs
editing at once.

### "Required state" is two different kinds of condition

"Started / Ready / Completed" is a **project status**. "A specific framework
phase reached" is a **phase reference**. Putting both in one text column makes
it polymorphic and unvalidatable.

Suggested shape: nullable `required_status` and nullable `required_phase_id`,
with a check that exactly one is set. `required_phase_id` then needs its own
composite foreign key so it can only name a phase of the **prerequisite
project's own framework** — the same class of bug the `(framework_id, phase_id)`
key on `projects` already prevents.

### Derive the status; do not store it

Pending/Satisfied depend on the prerequisite's current state, which changes
independently of the dependency row. A stored status goes stale silently, which
is the failure mode this whole feature exists to remove.

Three of the four need definitions the spec must state, because they are not
equally derivable:

- **Satisfied / Pending** — purely derivable from the prerequisite's state
  against `required_state`.
- **At Risk** — needs a rule. Prerequisite's own health? Its target date against
  the dependency's required-by date? Both? Say which.
- **Blocked** — is this "the required state is unmet and the required-by date
  has passed", or "unmet and the dependent project is at the point of needing
  it"? These differ, and the badge means different things to different readers
  until it is pinned down.

### The cycle check and the portfolio view are the same query

The recursive CTE that prevents cycles is the traversal that produces the
cascade view in section 5. Building it once, as a view or a set-returning
function, means the thing enforcing the rule and the thing drawing the chain
cannot disagree.

### This does not depend on Delivery Items

Section 10 places it third, which is fine, but the only hard prerequisite is the
**Projects write path** — dependencies are project-to-project and touch nothing
Delivery Items introduces. If cross-project risk turns out to be the sharper
pilot pain point, this can move ahead of Delivery Items without rework.
