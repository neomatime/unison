# UNISON product principles

**Locked 2026-09-03 by the product owner.** This document governs the others in
`docs/` — where a feature requirement and this principle disagree, this wins,
and the requirement is the thing that changes.

## North star

> **UNISON should minimise the coordination tax of project management.**

Supporting statement:

> UNISON should remove administrative friction so that PMs can spend more time
> managing outcomes, decisions, risks and people — and less time maintaining the
> machinery around the project.

Final design rule:

> **UNISON should feel powerful because the PM has to do less, not because the
> product contains more.**

Core principle: give PMs the minimum system interaction required to maintain
maximum delivery control. Internal aspiration, not external copy: *make UNISON a
PM's paradise.*

## 1. Primary objective

Less time on: manual status updates, chasing team members, reconciling
information across tools, updating duplicate trackers, rebuilding status
reports, searching for project information, manually tracking dependencies,
checking governance readiness, identifying ownership, determining what needs
attention.

More time on: delivery outcomes, risks, decisions, stakeholder management,
dependencies, escalation, governance, problem solving, team coordination,
intervention.

**Reduce administrative effort. Do not simply digitise it.**

## 2. Feature evaluation rule

Every PM-facing feature is judged against one question:

> **Does this reduce the coordination tax of project management?**

A feature should eliminate manual work, automate repetition, reduce duplicate
entry, route updates to the right owner, improve visibility, accountability or
governance, surface exceptions automatically, or reduce reconciliation, chasing
and reporting effort.

**If a feature merely creates another record the PM must maintain by hand, its
value must be challenged.**

## 3. Do not turn Excel pain into UNISON data-entry pain

UNISON must not become *"Excel, but with more screens."*

The PM must never update the same delivery fact across Delivery Items, project
health, portfolio health, status reports, executive dashboards, dependency
status and governance views.

**Enter information once. Reuse it everywhere.** When an underlying fact
changes, every view derives from it automatically.

## 4. The PM is not UNISON's data clerk

Ownership sits with the person responsible for the underlying item: delivery
item owner updates the delivery item, risk owner updates the risk, approver
responds to the approval, vendor owner updates the vendor obligation, evidence
owner submits evidence, dependency owner maintains the dependency.

UNISON consolidates state. The PM manages exceptions and intervention — they
coordinate and govern, rather than acting as the human API between every
participant.

## 5. Specialist tools own detailed execution

Do not require duplication of what Azure DevOps, Jira, SharePoint, repositories,
testing tools or finance systems already hold. Consume through integration
rather than making users maintain it twice.

UNISON owns: governance, project and portfolio visibility, accountability,
cross-project coordination, traceability, approvals, dependencies, executive
visibility, delivery control.

## 6. Different levels need different abstraction

One underlying delivery state, several views — never a manual reporting layer
per audience.

- **Executive / sponsor** — portfolio health, major risks, intervention points,
  outcomes, strategic dependencies, required decisions
- **PMO / delivery leadership** — governance, frameworks, standards, portfolio
  control, delivery consistency
- **Project manager** — coordination, exceptions, delivery health,
  dependencies, approvals, blockers, ownership
- **Delivery team** — owned updates, evidence, actions, responsibilities

## 7. Surface attention, not noise

Prioritise exceptions over notification volume. The PM Command View orders by:

- **Critical** — serious delivery threats, blocked projects, critical
  dependencies, major governance failures
- **Decision required** — overdue approvals, unresolved decisions, sponsor
  intervention
- **Watch** — deteriorating health, approaching milestone risk, stale updates,
  emerging dependencies

Reduce cognitive load. A long list of low-value alerts is a failure.

## 8. Do not over-automate judgement

Not every health decision is algorithmic. Distinguish **system indicators** from
**reported / management health**, and surface the conflict rather than
overriding the human:

> Reported health: Green — *3 critical indicators conflict with the reported
> health.*

Assist decision-making. Do not falsely claim certainty.

## 9. Frameworks absorb methodology variation

The core model stays stable and opinionated: project, framework, phase, gate,
delivery item, requirement, risk, decision, approval, evidence, dependency,
people. Method-specific terminology and behaviour come from **framework
configuration**, not new global modules or bespoke workflows.

This is what protects UNISON from methodology-driven scope creep.

## 10. Excel is not the enemy

Do not position the product around eliminating Excel. Excel is good at flexible
analysis and ad hoc work. What UNISON replaces is Excel used as a workflow
engine, governance system, database, collaboration system, audit trail or
portfolio reporting system.

**Import and export remain important.**

## 11. User validation and buyer validation are separate

- **User:** does the PM genuinely prefer running the project through UNISON?
- **Buyer:** does leadership believe the resulting control, visibility,
  governance and delivery outcomes are worth paying for?

**PM enthusiasm alone is not product-market validation.** Likely buyers: head of
PMO, CIO, COO, programme director, transformation executive, enterprise delivery
lead.

## 12. Governance allows controlled exceptions

Enforce governance without rigidity. An incomplete gate condition need not be an
absolute block. Where the organisation permits it, offer *complete the
requirement* **or** *request an exception* — with reason, approver, risk
acceptance, expiry or review date, and supporting evidence.

## 13. North-star success criteria

Fewer manual updates. Less duplicated information. Fewer people chased for
status. Owners updating their own responsibilities. Faster identification of
blockers and dependencies. Project state understood without reconciling several
tools. Easier status reporting, governance readiness and executive answers.
Less time on project machinery, more on project management.

## 14. Pilot measurement

The primary pilot measure:

> **How many things did the PM have to manually chase, reconcile or update that
> UNISON could reasonably have handled instead?**

Drive that number down.

---

# Engineering notes

*Consequences of the principles above, not amendments to them.*

### This principle already indicts code in the repository

The rule has immediate teeth. Applied to what exists today:

- **The provisioning wizard is pure coordination tax.** It collects initial
  users, departments, teams, delivery roles, and toggles for guest access,
  restricted projects, SSO-required and MFA-required — and persists the
  organisation and its primary admin. Everything else is typing that produces
  nothing. Under §2 the answer is to **cut those steps, not to finish them**;
  under §3 the MFA toggle is worse than tax, because it implies enforcement that
  exists nowhere. Already recorded in `docs/follow-ups.md`.
- **`RecordCollectionWorkspace` mutates records in local state.** Archive,
  duplicate and restore appear to succeed and revert on the next page load. That
  is beyond tax — it is work the PM does twice, having been told once that it
  worked.
- **The delivery overview's honest zeros are the principle working.** Portfolio
  health renders `—` rather than a fabricated percentage for a tenant with no
  data. That is §8 in practice: assist, do not claim certainty.

Worth re-reading `docs/follow-ups.md` against §2 before the next slice — several
open items are "finish this half-built form", and the right answer for some of
them is now removal.

### Derive, do not store — and never denormalise onto a human

§3 has a hard architectural corollary: **if a fact is derivable from another
fact, derive it.** A stored copy of a derivable value is coordination tax
internalised into the schema — it goes stale silently, and the fix is always
someone re-entering it.

This has already come up twice, in `docs/project-dependencies.md` (dependency
status must be computed from the prerequisite's current state) and implicitly in
portfolio health. It will come up again under query-performance pressure, and
the compromise must be stated now: **denormalise only with a mechanism that
keeps it honest** — a trigger, a generated column, a materialised view. Never by
asking a person to keep two places in agreement.

### §4 is the largest gap between principle and platform

"Owners update their own items" needs three things UNISON does not have:
notifications, per-owner task surfaces, and assignment routing. Notification
persistence is unimplemented; there is no notification service, schema or UI.

So §4 is currently **unachievable** — today every update flows through whoever
is signed in, which is the PM. This is not a criticism of the principle; it is
the sequencing consequence. Any roadmap claiming to reduce PM chasing has an
unbuilt notification and ownership-routing layer sitting underneath it, and that
work should be planned as such rather than assumed.

### §7 describes a feature, not a screen arrangement

A PM Command View that orders by Critical / Decision Required / Watch needs a
defined rule per category and per source — what makes a dependency critical,
what counts as a stale update, what threshold turns health into a watch item.
Those are product decisions with schema consequences, not layout.

### §12 exceptions are a record, not a flag

A gate exception carrying reason, approver, risk acceptance, expiry and evidence
is an entity with its own lifecycle, and it overlaps the approvals module that
already exists. It should reuse that rather than grow a parallel path — and the
expiry means something has to notice when an exception lapses, which lands back
on the notification gap above.

### §14 needs an instrument

"How many things did the PM manually chase or reconcile" is the right measure
and it will not collect itself. Decide before the pilot starts how it is
captured — a shared log the PM fills in, a weekly interview, a tally sheet.
Without an instrument this becomes a retrospective impression, which is exactly
the kind of unfalsifiable claim §11 is trying to avoid.
