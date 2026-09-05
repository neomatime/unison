# Requirement: First-Buyer Readiness and Demonstrable Enterprise Value

**Status:** Formal requirement, agreed 2026-09-03.
**Governed by:** `docs/product-principles.md`.

## Purpose

UNISON must be sellable as a governed project delivery system **before it is
feature-complete**. A buyer should see, within a short demonstration or pilot,
how UNISON improves visibility, governance, accountability and coordination
compared with their current mix of Excel, email, SharePoint, PowerPoint and
specialist tools.

This is not about adding modules. It is about the existing product producing a
compelling, credible and measurable first-buyer experience.

> A buyer should not have to understand every UNISON feature to understand why
> the organisation needs UNISON. **UNISON must make its value visible.**

## 1. The minimum sellable experience

One end-to-end journey, shown as related concepts rather than separate modules:

```
Portfolio → Project → Delivery Items → Ownership
  → Current Phase / Status / Health → Blocker / Dependency
  → Governance Gate → Approval / Evidence → Executive & PM visibility
```

It must answer: what are we delivering, where does it stand, who owns it, what
is at risk, what is blocking progression, what approvals are outstanding, which
other projects are affected, are we governance-ready, what needs management
intervention.

## 2. Executive snapshot

Turn live delivery data into a concise management view — **not** a separate BI
platform.

**Project:** reported health, current phase, delivery item progress, items at
risk or blocked, major dependencies, outstanding approvals, upcoming gate, major
risks, decisions required, milestone status, last meaningful update.

**Portfolio:** projects by health, projects requiring intervention, critical
cross-project dependencies, blocked projects, upcoming gates, outstanding
executive decisions, major portfolio risks.

> Executives should see the **implications** of delivery data, not the
> administrative detail underneath it.

## 3. Drill-down from problem to cause

Traceable visibility, not a RAG indicator:

```
Portfolio:  Digital Claims Platform — AT RISK
  → Project:  testing gate at risk
    → Feature: Document Upload — At Risk
      → Reason: UAT approval outstanding
        → Approval: Claims Operations Sign-off · Jane Doe · due 22 Sep · Overdue
```

The buyer must see that UNISON **explains why intervention is required**.

## 4. Framework-led implementation is a selling point

> "UNISON does not force your organisation to adopt our methodology. It
> digitises and governs the methodology your organisation has chosen."

Framework configuration covers phases, gates, required artefacts, governance
controls, approval requirements, role expectations, delivery item terminology
and progression rules. **No separate code paths per methodology.**

## 5. Controlled import / fast start

First buyers have live projects and must not rebuild them record by record. Use
a **UNISON-defined CSV/Excel template** — project, delivery item level, name,
parent, owner, status, health, current phase, target date.

**Do not build a generic "import any spreadsheet" engine.**

## 6. Demonstrable reduction in manual coordination

Capture before/after: trackers used, manual status updates, people chased, time
preparing status reports, time to determine project state, disconnected sources
consulted, approval turnaround visibility, dependency visibility, time to answer
executive questions.

**Do not manufacture ROI.** Report only what is observed or measured.

## 7. Value evidence

Where data supports it: delivery items with assigned owners, overdue approvals,
blocked dependencies, stale updates, governance readiness, gate completion,
projects requiring intervention, dependency chains at risk. **Not vanity
metrics.**

## 8. Enterprise trust requirements

Tenant isolation, RBAC, permissions, auditability, created-by/updated-by
attribution, approval history, secure authentication, data access boundaries,
archival and retention, eventual SSO. Buyer confidence requirements rather than
headline features.

> **Do not add fake settings or UI controls for security capabilities that are
> not actually enforced. A field in the UI is a product claim.**

## 9. Source of truth per domain

For every domain, state whether UNISON is a **system of record** or a **system
of visibility/governance**.

UNISON owns: project governance, framework progression, approvals, project
dependencies, reported health, decisions, governance evidence.
External systems own: engineering stories and tasks, sprint execution, commits
and pull requests, accounting transactions.

This distinction guides every future integration.

## 10. Demo rule

**Not a module tour.** Not "here are Projects, here are Vendors, here are
Clients, here are Invoices." One delivery story: portfolio → project → delivery
items → at-risk feature → current phase → blocking dependency → outstanding
approval → required evidence → downstream impact → back to the executive view.

The buyer leaves thinking: *we could see our project delivery state in one
governed system.*

## 11. Value before full configuration

A **Core** implementation must already deliver value: projects, frameworks,
delivery items, team ownership, approvals, governance, portfolio visibility,
project dependencies. Operations, Commercial and Finance enhance the product but
are not required for the fundamental proposition.

## 12. No custom-build dependency

Client-specific needs are met by framework configuration, tenant configuration,
module entitlement, permissions, organisation structure and supported workflow
configuration. **One UNISON codebase.** No client forks.

## 13. Success test

- **PM:** would you prefer running the project this way rather than through the
  current spreadsheet and email process?
- **Buyer:** does UNISON give you materially better delivery control, visibility
  and governance than you have today?

Both answers matter. Neither alone is sufficient.

## 14. Positioning

Not project management software, task management, an Excel replacement, a Jira
replacement or an Azure DevOps replacement.

> **UNISON is a governed enterprise project delivery system.** It turns an
> organisation's delivery methodology into a live operating environment
> providing visibility, governance, accountability, traceability, project
> coordination and portfolio control.

## 15. North star

> The first commercial version does not need to do everything. It needs to make
> the buyer clearly understand **what they are currently missing**.

Final test — if a buyer thinks *"this is a nicer project tracker,"* the product
or the demo has failed. If they think *"this gives us control and visibility
over delivery that we currently assemble by hand,"* it is communicating the
right value.

---

# Engineering notes

*Consequences and current state, not amendments.*

### The honest distance to §1

`public` contains eight tables: `organizations`, `memberships`, `invitations`,
`audit_events`, `clients`, `frameworks`, `framework_phases`, `projects`.
Everything else in the product renders from fixture files. Mapping §1's journey
against that:

| Step in the journey | Today |
| --- | --- |
| Portfolio | Fixtures (`features/delivery/portfolio-data.ts`) — no table |
| Project | **Real**, read-only; the write path exists but no form calls it |
| Delivery Items | Does not exist — direction agreed in `docs/delivery-items.md` |
| Ownership | `projects.owner_id` exists but is deliberately **not settable** — it was removed from the input schema because it references `auth.users` with nothing tenant-scoping it |
| Current phase / status / health | **Real** |
| Blocker / dependency | Does not exist — requirement in `docs/project-dependencies.md` |
| Governance gate | Does not exist. Phases exist; gates are a separate concept with no table |
| Approval / evidence | Neither exists. Approvals is a fixture screen |
| Executive & PM visibility | Four figures real, the rest fixtures |

**Two of nine steps are real today.** That is not an argument against this
requirement — it is the requirement doing its job, by making the gap countable
instead of impressionistic. But it means §10's demo is **not currently
possible**, and the shortest honest path to it is roughly:

1. Projects write path — everything hangs off a project nobody can create
2. Ownership, tenant-scoped — a composite key through `memberships`, which is
   the unresolved reason it was pulled
3. Delivery Items
4. Approvals as real records
5. Dependencies
6. Gates and evidence

Portfolio and the executive snapshot are then **derived views over the above**,
not new domains — which is the §3-of-principles rule working in our favour.

### §8 is already violated, and it is the section buyers audit

The provisioning wizard offers **SSO Required** and **MFA Required** toggles.
Neither enforces anything anywhere in the codebase; a tenant provisioned with
"MFA Required" on is not enforcing MFA. This is recorded in
`docs/follow-ups.md`, and §8 now gives it a commercial consequence rather than
only a correctness one: an enterprise buyer doing security due diligence finds a
control that does nothing. That is worse than the control being absent, because
absence is a roadmap conversation and a fake toggle is a trust failure.

**Remove those toggles before any buyer demonstration.** They are the clearest
existing instance of the rule §8 states.

### §5 import must reuse the write path, not bypass it

A CSV importer that writes rows directly becomes a second door into the schema
with its own rules, and the tenant-scoped composite foreign keys on `projects`
are exactly where a bypass produces cross-tenant defects. The importer should
call the same validated server actions a form calls, differing only in that it
loops. Slower, and the only version that cannot develop a separate security
posture from the UI.

### §9 deserves a real table, and half of it is already decided

The source-of-truth split is currently prose spread across three documents. It
should become one table in this file as domains are settled — `delivery-items.md`
and `project-dependencies.md` have already fixed two rows of it (UNISON owns
delivery items down to two levels and project-to-project dependencies; Jira and
Azure DevOps own stories, tasks, sprints, branches and CI). Finance and testing
are the next rows to decide, and deciding them late is how duplicate maintenance
gets built by accident.

### §11 already agrees with the tier configuration

Core entitlement is the six Delivery modules plus Team — Overview, Portfolio,
Projects, Frameworks, Approvals, Vendors, Team. That is §11's list almost
exactly, and it was verified working against a real Core tenant on 2026-09-03.
So the commercial claim in §11 and the entitlement model already match; no
change needed, which is worth knowing before someone proposes one.
