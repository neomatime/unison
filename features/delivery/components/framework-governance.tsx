"use client";

import { useActionState } from "react";
import { createGovernanceGateAction } from "../actions/framework-governance";
import type { FrameworkDetail } from "../queries/get-framework";
import { SectionCard } from "./delivery-primitives";

const field =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function FrameworkGates({ framework }: { framework: FrameworkDetail }) {
  const [state, action, pending] = useActionState(
    createGovernanceGateAction.bind(null, framework.id),
    undefined,
  );
  return (
    <SectionCard
      title="Governance gates"
      description="Evidence and approval controls applied before framework progression."
    >
      {framework.gates.length ? (
        <div className="divide-y divide-border">
          {framework.gates.map((gate) => (
            <div
              key={gate.id}
              className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-semibold">{gate.name}</p>
                <p className="text-sm text-muted-foreground">
                  {gate.phaseName}
                  {gate.description ? ` · ${gate.description}` : ""}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {[
                  gate.approvalRequired && "Approval",
                  gate.evidenceRequired && "Evidence",
                ]
                  .filter(Boolean)
                  .join(" + ") || "Advisory"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          No governance gates have been configured.
        </p>
      )}
      <form
        action={action}
        className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
      >
        <select required name="phaseId" className={field}>
          <option value="">Choose phase</option>
          {framework.phases
            .filter((p) => !p.archivedAt)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <input required name="name" placeholder="Gate name" className={field} />
        <textarea
          name="description"
          placeholder="Progression criteria"
          className={`${field} min-h-20 py-2`}
        />
        <div className="space-y-2 text-sm">
          <label className="flex gap-2">
            <input type="checkbox" name="approvalRequired" defaultChecked />
            Approval required
          </label>
          <label className="flex gap-2">
            <input type="checkbox" name="evidenceRequired" defaultChecked />
            Evidence required
          </label>
        </div>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : state?.success ? (
          <p role="status" className="text-sm text-success">
            {state.success}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button
            disabled={pending}
            className="bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Add gate
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

export function FrameworkVersions({
  framework,
}: {
  framework: FrameworkDetail;
}) {
  return (
    <SectionCard
      title="Version history"
      description="Immutable snapshots captured whenever the framework definition changes."
    >
      {framework.versions.length ? (
        <div className="divide-y divide-border">
          {framework.versions.map((version) => (
            <div
              key={version.id}
              className="flex justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="font-semibold">
                  Version {version.version ?? "unlabelled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Previous definition retained for audit
                </p>
              </div>
              <time className="text-xs text-muted-foreground">
                {new Date(version.createdAt).toLocaleString("en-ZA")}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          No framework changes have been recorded yet.
        </p>
      )}
    </SectionCard>
  );
}
