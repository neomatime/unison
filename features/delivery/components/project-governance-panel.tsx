"use client";

import { useActionState, useState } from "react";
import {
  createApprovalAction,
  createArtefactAction,
  createDecisionAction,
  createRiskAction,
  type GovernanceActionState,
} from "../actions/project-governance";
import type { getProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";

type Governance = Awaited<ReturnType<typeof getProjectGovernance>>;
const tabs = ["Gates & approvals", "Risks", "Decisions", "Evidence"] as const;
const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand";
const area = `${input} min-h-24 py-2`;

export function ProjectGovernancePanel({
  projectId,
  governance,
}: {
  projectId: string;
  governance: Governance;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Gates & approvals");
  return (
    <div>
      <nav
        className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
        aria-label="Project governance tabs"
      >
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${tab === item ? "border-brand text-brand" : "border-transparent text-muted-foreground"}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === "Gates & approvals" ? (
        <ApprovalRegister projectId={projectId} rows={governance.approvals} />
      ) : tab === "Risks" ? (
        <RiskRegister projectId={projectId} rows={governance.risks} />
      ) : tab === "Decisions" ? (
        <DecisionRegister projectId={projectId} rows={governance.decisions} />
      ) : (
        <EvidenceRegister projectId={projectId} rows={governance.artefacts} />
      )}
    </div>
  );
}

function Feedback({ state }: { state: GovernanceActionState | undefined }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : state?.success ? (
    <p role="status" className="text-sm text-success">
      {state.success}
    </p>
  ) : null;
}

function ApprovalRegister({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Governance["approvals"];
}) {
  const [state, action, pending] = useActionState(
    createApprovalAction.bind(null, projectId),
    undefined,
  );
  return (
    <Register
      title="Governance approvals"
      description="Controlled gate and project decisions with durable status history"
      headings={["Approval", "Priority", "Due", "Status"]}
      rows={rows.map((row) => [
        row.title,
        row.priority,
        row.due_date ?? "—",
        row.status,
      ])}
    >
      <form
        action={action}
        className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
      >
        <input
          name="title"
          required
          placeholder="Approval title"
          className={input}
        />
        <select name="priority" className={input}>
          <option>Medium</option>
          <option>Low</option>
          <option>High</option>
          <option>Critical</option>
        </select>
        <textarea
          name="description"
          placeholder="Decision context"
          className={area}
        />
        <input name="dueDate" type="date" className={input} />
        <Feedback state={state} />
        <div className="flex justify-end gap-2">
          <button
            name="intent"
            value="draft"
            disabled={pending}
            className="border border-border px-4 py-2 text-sm font-semibold"
          >
            Save draft
          </button>
          <button
            name="intent"
            value="submit"
            disabled={pending}
            className="bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Submit
          </button>
        </div>
      </form>
    </Register>
  );
}

function RiskRegister({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Governance["risks"];
}) {
  const [state, action, pending] = useActionState(
    createRiskAction.bind(null, projectId),
    undefined,
  );
  return (
    <Register
      title="Risk register"
      description="Project threats, exposure and mitigation ownership"
      headings={["Risk", "Probability", "Impact", "Status"]}
      rows={rows.map((row) => [
        row.title,
        row.probability,
        row.impact,
        row.status,
      ])}
    >
      <form
        action={action}
        className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
      >
        <input
          name="title"
          required
          placeholder="Risk title"
          className={input}
        />
        <div className="grid grid-cols-2 gap-3">
          <select name="probability" className={input}>
            {["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
          <select name="impact" className={input}>
            {["Minor", "Moderate", "Major", "Severe"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <textarea
          name="description"
          placeholder="Risk description"
          className={area}
        />
        <textarea
          name="mitigation"
          placeholder="Mitigation plan"
          className={area}
        />
        <input name="targetDate" type="date" className={input} />
        <div>
          <Feedback state={state} />
          <button
            disabled={pending}
            className="mt-2 bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Add risk
          </button>
        </div>
      </form>
    </Register>
  );
}

function DecisionRegister({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Governance["decisions"];
}) {
  const [state, action, pending] = useActionState(
    createDecisionAction.bind(null, projectId),
    undefined,
  );
  return (
    <Register
      title="Decision register"
      description="What was decided, when, and why"
      headings={["Decision", "Outcome", "Date"]}
      rows={rows.map((row) => [row.title, row.decision, row.decided_at])}
    >
      <form
        action={action}
        className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
      >
        <input
          name="title"
          required
          placeholder="Decision title"
          className={input}
        />
        <input name="decidedAt" type="date" className={input} />
        <textarea
          name="decision"
          required
          placeholder="Decision made"
          className={area}
        />
        <textarea name="rationale" placeholder="Rationale" className={area} />
        <Feedback state={state} />
        <div className="flex justify-end">
          <button
            disabled={pending}
            className="bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Record decision
          </button>
        </div>
      </form>
    </Register>
  );
}

function EvidenceRegister({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Governance["artefacts"];
}) {
  const [state, action, pending] = useActionState(
    createArtefactAction.bind(null, projectId),
    undefined,
  );
  return (
    <Register
      title="Governance evidence"
      description="Controlled links to artefacts supporting gates and approvals"
      headings={["Artefact", "Notes", "Added"]}
      rows={rows.map((row) => [
        row.external_url ? (
          <a
            key={row.id}
            href={row.external_url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand"
          >
            {row.name}
          </a>
        ) : (
          row.name
        ),
        row.notes ?? "—",
        new Date(row.created_at).toLocaleDateString("en-ZA"),
      ])}
    >
      <form
        action={action}
        className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
      >
        <input
          name="name"
          required
          placeholder="Artefact name"
          className={input}
        />
        <input
          name="externalUrl"
          required
          type="url"
          placeholder="https://…"
          className={input}
        />
        <textarea name="notes" placeholder="Evidence notes" className={area} />
        <div>
          <Feedback state={state} />
          <button
            disabled={pending}
            className="mt-2 bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Attach evidence
          </button>
        </div>
      </form>
    </Register>
  );
}

function Register({
  title,
  description,
  headings,
  rows,
  children,
}: {
  title: string;
  description: string;
  headings: string[];
  rows: React.ReactNode[][];
  children: React.ReactNode;
}) {
  return (
    <SectionCard title={title} description={description}>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                {headings.map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-3 text-sm">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No records yet.</p>
      )}
      {children}
    </SectionCard>
  );
}
