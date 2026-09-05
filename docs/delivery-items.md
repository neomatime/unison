# Delivery Items — locked product direction

**Decided 2026-09-03 by the product owner. Not yet built.**

This is the agreed direction, not an implementation spec. The spec is written
from it once the Projects write path exists — see Sequencing below.

## The product principle

> UNISON Delivery Items provide a maximum two-level representation of major
> project execution units. Their terminology is defined by the project's
> framework. Delivery Items expose enough execution context for governance,
> visibility and accountability, but deliberately stop before engineering-level
> backlog management.

UNISON does **not** own user stories, engineering tasks, sprint planning, story
points, branches, commits, pull requests or CI/CD. Those stay in Azure DevOps,
Jira or equivalent. Later, those systems sync execution data *upward* into
UNISON; UNISON never replaces the tools engineers already use.

The boundary, stated as a test: would an engineer open UNISON daily to do their
job? If yes, we have built Azure DevOps. A delivery lead opens it weekly and an
executive monthly.

## Why generic, not Epic/Feature

Epic and Feature are not in the data model. A Delivery Item has a **level** (1
or 2), and the labels for those levels come from the project's framework — so
methodology is configuration rather than three code paths, which is the same
reason `frameworks` and `framework_phases` are per-tenant rows and not an enum.

| Framework   | Level 1      | Level 2     |
| ----------- | ------------ | ----------- |
| Agile       | Epic         | Feature     |
| Waterfall   | Work Package | Deliverable |
| Regulatory  | Obligation   | Control     |

## Two levels, enforced structurally

The depth cap is a schema rule, not a convention. A third level must be
*unrepresentable*, not merely discouraged:

- `level` may only be 1 or 2
- a level-1 item has no parent
- a level-2 item must have a level-1 parent
- invalid parent/level combinations are rejected by the schema

The reason it is structural: "we stop at two levels" is a principle, and
principles erode one reasonable request at a time. If a third level cannot be
written, the boundary survives without anyone defending it in a meeting. This
follows the same discipline as the composite tenant-scoped foreign keys on
`projects` — make invalid states unrepresentable rather than merely checked.

If a third level is ever genuinely needed, that is a deliberate product-model
change on validated client demand, not a schema convenience.

## Current phase, not phase ownership

**A Delivery Item has a current framework phase; it does not permanently belong
to one.** A feature moves Discover → Design → Build → Test → Ready. Modelling
`phase_id` as ownership would be wrong and would defeat the point.

This is what lets UNISON answer the questions the pilot exists to test:

- What is currently in Build?
- What is currently in Test?
- What is at risk?
- Where are the major pieces of this project right now?

Two consequences for the spec:

- `current_phase_id` must be constrained to phases of **the project's own
  framework**, which is the composite-FK pattern `projects` already uses. A
  delivery item pointing at another framework's phase must be unrepresentable.
- Phase *history* is deliberately out of scope for the pilot, but "how long has
  this been in Test" is the next question a PM asks, and it needs transition
  history. Know it is coming; do not build it yet.

## Fields: plumbing versus product claims

A field in the UI is a claim that UNISON supports that capability. Only surface
what is backed by real functionality.

**Initial fields:** name, level/type, parent, project, owner, status, health,
current phase, start date, target date, description, source system, external
reference.

`source_system` and `external_reference` are **plumbing**, added now despite
being null through the pilot: they are invisible to users, they claim nothing,
and retrofitting external identity mapping onto populated data later is
genuinely painful. That is the distinction — plumbing may run ahead of use;
product claims may not.

**Deliberately NOT surfaced** until the capability genuinely exists and is
backed by real relationships: linked test cases, testing status, linked risks,
dependency graphs, requirements coverage, defect status, traceability health.

The precedent for this rule is in `docs/follow-ups.md`: the provisioning wizard
collects SSO-required and MFA-required toggles that enforce nothing anywhere in
the codebase. A tenant provisioned with "MFA Required" on is not enforcing MFA.
Do not repeat that shape here.

## Sequencing

1. **Projects write path** — nothing can create a project today; the three
   server actions exist and no form calls them. Delivery Items on an unwritable
   parent gives a hierarchy nobody can populate.
2. **Delivery Items** (this document)
3. Requirements and real relationships
4. Deeper traceability
5. Azure DevOps / Jira integration, syncing upward

## Pilot scope

Deliberately narrow. One project, a level-1 item, a level-2 item, and for each:
owner, status, health, current phase, target date.

The hypothesis being tested is not "can we model a hierarchy". It is:

> Can a PM understand where the major parts of the project stand without
> manually reconciling Excel, emails and multiple trackers?

If yes, the model is validating the right problem. If the pilot needs more
fields to answer that question, that is a finding worth having before the
schema hardens.
