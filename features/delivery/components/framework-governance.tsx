"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createGovernanceGateAction,
  deleteGovernanceGateAction,
  updateGovernanceGateAction,
} from "../actions/framework-governance";
import type { FrameworkDetail } from "../queries/get-framework";
import { SectionCard } from "./delivery-primitives";

const field =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

type Gate = FrameworkDetail["gates"][number];

function EditGateForm({
  gate,
  onCancel,
}: {
  gate: Gate;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateGovernanceGateAction.bind(null, gate.id),
    undefined,
  );
  // Close on success: React resets an action-bound form's uncontrolled fields to
  // their defaultValue afterwards, so a form left open would show the pre-edit
  // values even though the write succeeded.
  useEffect(() => {
    if (state?.success) onCancel();
  }, [state, onCancel]);
  return (
    <form
      action={action}
      className="grid gap-3 bg-muted/20 p-5 md:grid-cols-2"
    >
      <input
        required
        name="name"
        defaultValue={gate.name}
        placeholder="Gate name"
        aria-label="Gate name"
        className={field}
      />
      <p className="self-center text-sm text-muted-foreground">
        Phase: {gate.phaseName}
      </p>
      <textarea
        name="description"
        defaultValue={gate.description ?? ""}
        placeholder="Progression criteria"
        aria-label="Progression criteria"
        className={`${field} min-h-20 py-2`}
      />
      <div className="space-y-2 text-sm">
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="approvalRequired"
            defaultChecked={gate.approvalRequired}
            aria-label="Approval required"
          />
          Approval required
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="evidenceRequired"
            defaultChecked={gate.evidenceRequired}
            aria-label="Evidence required"
          />
          Evidence required
        </label>
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive md:col-span-2">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 md:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="border border-border px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          disabled={pending}
          className="bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Save changes
        </button>
      </div>
    </form>
  );
}

function DeleteGateButton({ gate }: { gate: Gate }) {
  const [state, action, pending] = useActionState(
    deleteGovernanceGateAction.bind(null, gate.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Remove the gate "${gate.name}"? This cannot be undone, and any evidence attached to this gate is removed too.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        aria-label={`Remove gate ${gate.name}`}
        className="border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive"
      >
        Remove
      </button>
      {state?.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function FrameworkGates({ framework }: { framework: FrameworkDetail }) {
  const [editingId, setEditingId] = useState<string | null>(null);
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
          {framework.gates.map((gate) =>
            editingId === gate.id ? (
              <EditGateForm
                key={gate.id}
                gate={gate}
                onCancel={() => setEditingId(null)}
              />
            ) : (
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      gate.approvalRequired && "Approval",
                      gate.evidenceRequired && "Evidence",
                    ]
                      .filter(Boolean)
                      .join(" + ") || "Advisory"}
                  </p>
                </div>
                <div className="flex items-start justify-end gap-2">
                  <button
                    type="button"
                    aria-label={`Edit gate ${gate.name}`}
                    onClick={() => setEditingId(gate.id)}
                    className="border border-border px-3 py-1.5 text-xs font-semibold"
                  >
                    Edit
                  </button>
                  <DeleteGateButton gate={gate} />
                </div>
              </div>
            ),
          )}
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
        <select
          required
          name="phaseId"
          aria-label="Phase"
          className={field}
        >
          <option value="">Choose phase</option>
          {framework.phases
            .filter((p) => !p.archivedAt)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <input
          required
          name="name"
          placeholder="Gate name"
          aria-label="Gate name"
          className={field}
        />
        <textarea
          name="description"
          placeholder="Progression criteria"
          aria-label="Progression criteria"
          className={`${field} min-h-20 py-2`}
        />
        <div className="space-y-2 text-sm">
          <label className="flex gap-2">
            <input
              type="checkbox"
              name="approvalRequired"
              defaultChecked
              aria-label="Approval required"
            />
            Approval required
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              name="evidenceRequired"
              defaultChecked
              aria-label="Evidence required"
            />
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
