# UNISON product definition

**Locked 2026-09-06 by the product owner.** This is the authoritative statement
of what UNISON is. It is the strategic reference for product, architecture and
UX decisions.

**Precedence.** This document defines *what* UNISON is — its category,
boundaries and operating loop. [`product-principles.md`](product-principles.md)
defines *how* it must be built — the design discipline. Where a feature
requirement disagrees with either, the requirement is the thing that changes.
Where these two disagree with each other, this document wins on scope and
category; principles wins on build discipline. They currently agree: the PM
principle in §5 below and the north star in `product-principles.md` are the same
sentence.

---

## 1. Locked product definition

> **UNISON is the operating layer for governed enterprise delivery.**

UNISON digitises how an organisation governs and delivers projects, by turning
its delivery methodology into a live operating environment.

UNISON is **not** primarily: project management software, task management
software, an Azure DevOps replacement, a Jira replacement, an ERP, an HRIS, an
accounting platform, an analytics dashboard, or an Excel replacement.

UNISON coexists with specialist execution systems and governs the delivery
system around them.

## 2. Core product thesis

Enterprise delivery is fragmented across Excel, email, PowerPoint, SharePoint,
Teams, Jira, Azure DevOps, specialist testing tools and finance systems.

The problem is not that these tools are bad. The problem is that no single
operating layer consistently governs methodology, delivery structure, phase
progression, approvals, evidence, dependencies, accountability, intervention and
executive visibility.

> UNISON turns an organisation's delivery methodology into a live operating
> environment for governance, visibility, accountability and intervention.

## 3. Frameworks are the core moat

Frameworks are not a secondary configuration feature. They are the engine that
defines how governed delivery works.

A Framework should be capable of defining or controlling: lifecycle phases,
gates, required artefacts, required evidence, roles, approval rules, governance
controls, Delivery Item terminology, progression rules, exception rules, default
governance expectations, and applicable project behaviour where practical.

```
FRAMEWORK  →  defines how projects operate
PROJECT    →  executes governed delivery
```

> UNISON does not force the organisation to adopt a generic methodology. It
> digitises the methodology the organisation has chosen.

**Avoid separate code paths per methodology** — Agile, Waterfall, Regulatory,
Transformation. Methodology stays configuration wherever practical.

## 4. The core operating loop

```
STRUCTURE     What are we delivering?
   ↓
OWN           Who is accountable?
   ↓
PROGRESS      Where does it stand?
   ↓
DETECT        What is late, blocked, deteriorating or inconsistent?
   ↓
INTERVENE     Who needs to act, and what decision is required?
   ↓
GOVERN        Are we allowed to progress?
   ↓
COMMUNICATE   What does leadership need to know?
```

Every core feature strengthens one or more stages:

| Feature | Stage |
| --- | --- |
| Projects | Structure |
| Delivery Items | Structure + Progress |
| Team ownership | Own |
| Project health | Progress + Detect |
| Dependencies | Detect + Intervene |
| Approvals | Govern |
| Gates | Govern |
| Executive briefing | Communicate |

A proposed feature that strengthens no stage is challenged on whether it belongs
in core UNISON.

## 5. PM value principle

> **Minimum system interaction. Maximum delivery control.**

Less time on: maintaining trackers, chasing updates, reconciling systems,
rebuilding status reports, hunting for authoritative information, working out
dependency impact by hand, checking gate readiness by hand, duplicating status
across views.

More time on: outcomes, risk, decisions, stakeholders, escalation, governance,
intervention.

> UNISON should feel powerful because the PM has to do less, not because the
> product contains more.

## 6. The PM is not UNISON's data clerk

Ownership sits with the actually accountable person.

| Role | Updates |
| --- | --- |
| Delivery Item Owner | the Delivery Item |
| Risk Owner | the risk |
| Approver | the approval |
| Evidence Owner | the evidence |
| Dependency Owner | the dependency |
| UNISON | consolidates state |
| PM | manages exceptions and intervention |

The PM must not become the human API between every project participant.

## 7. Source-of-truth boundaries

**UNISON is authoritative for:** Project, Framework, phase progression,
governance gates, approval decisions, project dependencies, reported project
health, project decisions, governance evidence, delivery accountability,
portfolio intervention state.

**External systems remain authoritative for:** user stories, engineering tasks,
sprint execution, story points, branches, commits, pull requests, CI/CD,
detailed accounting transactions, payroll, specialist engineering records.

> UNISON does not duplicate specialist execution. It governs the delivery system
> around it.

This boundary guides all future integration design.

## 8. Delivery Items

The generic abstraction for major execution structure. Two levels maximum,
framework-owned terminology. See [`delivery-items.md`](delivery-items.md).

| Methodology | Level 1 | Level 2 |
| --- | --- | --- |
| Agile | Epic | Feature |
| Waterfall | Work Package | Deliverable |
| Regulatory | Obligation | Control |

Structural rules — invalid hierarchy must be **unrepresentable**, not merely
rejected:

- level is 1 or 2 only
- level 1 cannot have a parent
- level 2 must have a level 1 parent
- a third level must not exist unless deliberately introduced later on validated
  demand

UNISON does not own user stories, tasks, sprint planning, story points,
branches, PRs or CI/CD. Delivery Items carry enough structure for governance and
visibility without becoming engineering backlog management.

## 9. Current phase model

A Delivery Item has a *current* framework phase. It does not permanently belong
to one.

> Feature: Document Upload · Current Phase: Test · Health: At Risk · Owner:
> Integration Team

This lets UNISON answer: what is currently in Build? in Test? what is stuck?
what is at risk? where are the major pieces of the project?

`current_phase_id` **must** be constrained to phases belonging to the project's
own framework.

Phase history is a future capability. Do not overbuild phase-history analytics
before the pilot validates the need.

## 10. Project dependencies and prerequisites

Project-to-project dependency visibility belongs in core Delivery. See
[`project-dependencies.md`](project-dependencies.md). Initial relationship type
is **Prerequisite**: Project B depends on Project A reaching a defined state
before B can proceed.

Fields: prerequisite project, dependent project, required state, owner,
criticality, target date, status, notes. Status may be Pending, Satisfied, At
Risk or Blocked.

Structural rules: same tenant only; no self-dependency; no duplicate
relationship; no circular dependencies.

Long-term, UNISON answers *what other projects could prevent this project from
succeeding?* and *if this project slips, what downstream delivery is affected?*

## 11. Causal delivery visibility

Visibility means more than RAG status. UNISON progressively reveals:

```
WHAT → WHY → IMPACT → OWNER → INTERVENTION REQUIRED
```

> Digital Claims Platform — AT RISK → Test Exit Gate threatened → UAT approval
> overdue → Claims Operations → 3 days overdue → 2 downstream projects
> potentially affected

Avoid dashboards that show only *Project = Red*. UNISON explains why the
condition exists and what must happen next.

## 12. Executive overview / briefing

> The Overview is not an analytics dashboard. It is a live delivery briefing
> that tells the user what is happening, why it matters, and what requires
> intervention.

Three primary zones, preserved:

1. Overall Position / Key Focus Areas
2. Requires Intervention
3. Delivery Horizon

It answers within roughly 60 seconds: what is happening, what matters, why it
matters, what requires intervention, what is coming next.

Do not let this screen drift back into KPI-card grids, widget-heavy analytics,
generic charts, duplicated metrics or operational detail overload. Operational
detail stays available through drill-down. This is a management briefing
surface.

## 13. Commercial and Finance positioning

Commercial and Finance may remain, but they are supporting business context and
must not blur the core proposition. Core UNISON must make complete sense without
Leads, Quotes, Sales, Invoices, Expenses and Forecast.

```
CORE UNISON                  Governed Enterprise Delivery
CONNECTED BUSINESS CONTEXT   Operations · Commercial · Finance
```

Do not reposition UNISON as ERP or CRM software.

## 14. Buyer model

- **Economic buyers:** Head of PMO, CIO, COO, Transformation Executive,
  Enterprise Delivery Executive, Programme Director
- **Champions:** Programme Manager, Senior Project Manager, PMO Lead
- **Daily users:** Project Managers, Business Analysts, governance teams,
  delivery leads, accountable owners
- **Executive consumers:** sponsors, ExCo, portfolio leadership

The PM feels the coordination pain. The PMO sees the governance and consistency
problem. The executive pays for visibility, control and intervention capability.

## 15. First-buyer product story

Do not sell through module tours — "here are Projects, here are Vendors, here
are Clients, here are Invoices". Demonstrate one delivery story. See
[`first-buyer-readiness.md`](first-buyer-readiness.md).

```
Portfolio → Project → Delivery Item → Issue → Impact → Dependency
          → Approval → Gate → Executive intervention
```

The buyer should conclude: *this gives us delivery control and visibility that
we currently assemble manually.* If they conclude *this is a nicer project
tracker*, the product story has failed.

## 16. Product promise

- **Category:** the operating layer for governed enterprise delivery
- **Problem:** enterprise delivery is fragmented across spreadsheets, email,
  documents and disconnected execution systems
- **Product:** UNISON turns an organisation's delivery methodology into a live
  operating environment
- **PM value:** minimum system interaction, maximum delivery control
- **Executive value:** know what is happening, why it matters and where
  intervention is required
- **Organisational value:** consistent execution, embedded governance, traceable
  accountability, live delivery visibility

## 17. Product boundary test

For every future feature:

1. Does this strengthen governed delivery?
2. Does it strengthen the core operating loop?
3. Does it reduce PM coordination overhead?
4. Does it improve visibility, accountability or governance?
5. Does it help detect exceptions?
6. Does it improve intervention?
7. Does it belong in UNISON rather than a specialist execution tool?
8. Does it create duplicate maintenance?
9. Does it blur the category?
10. Does it make the product harder to explain?

A feature failing most of these is challenged or deferred.

## 18. Build discipline

Product documentation must not run far ahead of implementation. Build order:

1. Complete Projects write path
2. Delivery Items
3. Project Dependencies / Prerequisites
4. Requirements
5. Traceability
6. Integrations later

Do not build speculative sophistication before the underlying operating loop
works.

## 19. Pilot validation

The PM pilot tests whether UNISON genuinely reduces coordination overhead.

> Can a PM understand where the major parts of the project stand without
> manually reconciling Excel, email and multiple trackers?

Measure: trackers used, manual updates performed, people chased, time to
determine project status, time to prepare status reporting, disconnected sources
consulted, dependency visibility, approval visibility, governance readiness,
ability to identify blockers, ability to answer executive questions.

Strongest user signal: *I do not want to go back to running this through
spreadsheets and email.*

Separate buyer validation: *does leadership believe this materially improves
delivery control, governance and visibility?* Both matter.

## 20. What to strengthen next

The next strategic product area is **Frameworks** — specifically, how Frameworks
become the real execution and governance engine rather than only a set of
project phases.

Areas to explore carefully: framework lifecycle and versioning,
framework-to-project instantiation, gate definitions, mandatory artefacts,
mandatory evidence, role expectations, approval rules, exception rules,
progression logic, Delivery Item terminology, framework-specific governance
behaviour.

Do not automatically implement every item. **First inspect the current
Frameworks model** and identify: what already exists, what is only UI, what is
actually enforced, what requires schema work, what can remain configuration, and
what would create unnecessary complexity. Then propose the smallest coherent
path that makes Frameworks meaningfully govern project execution.

## 21. Final north star

> **UNISON should make governed enterprise delivery easier to control, easier to
> understand and harder to lose track of.**

Loop: Structure → Own → Progress → Detect → Intervene → Govern → Communicate.

PM principle: *minimum system interaction, maximum delivery control.*

Executive principle: *know what is happening, why it matters and where
intervention is required.*

The goal is not to make UNISON bigger. The goal is to make it sharper, more
defensible, more coherent and harder to misunderstand.

---

## Where the codebase stands against this, on the date of locking

Recorded so the next reader can tell locked direction from current reality. This
section is observation, not direction, and will go stale — the sections above
will not.

- **§18 item 1 is complete.** The Projects write path merged as PR #1 (merge
  commit `b66e8b1`): create, edit and archive all reach the database, verified
  signed-in against live data.
- **§9's structural rule already holds for Projects.** `projects_phase_fkey` is
  `FOREIGN KEY (framework_id, phase_id) REFERENCES framework_phases(framework_id,
  id) ON DELETE SET NULL (phase_id)` — a phase from another framework is
  unrepresentable, not merely rejected. Delivery Items' `current_phase_id` should
  inherit this exact shape, including the `(phase_id)` column list.
- **§12's three zones are implemented.** The Overview renders Overall Position /
  Requires Intervention / Delivery Horizon, and the KPI-card grid the section
  warns against was deleted in the same branch. The drift risk this section
  guards is real and recent.
- **§3 is the largest gap.** Frameworks currently define phases and little else.
  Gates, artefacts, evidence, roles, approval rules and progression rules named
  in §3 are direction, not implementation.
- **§8 and §10 are unbuilt.** Delivery Items and dependencies have locked
  requirements documents but no schema.

**One sequencing question left open by this document.** §18 puts Delivery Items
next in the *build* order; §20 names Frameworks as the next strategic area to
*strengthen*. These are compatible if §20 is read as an investigation that runs
alongside or ahead of §18's build — inspect the Frameworks model, then propose
the smallest coherent path — rather than as a reordering of the build queue.
That is the reading applied here. If the intent was to move Frameworks ahead of
Delivery Items in the build order, this document should be amended to say so.
