"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createDecisionAction,
  deleteDecisionAction,
  updateDecisionAction,
} from "../actions/project-governance";
import type { ProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";
import { area, Feedback, formatDate, input } from "./governance-form-parts";

type Decision = ProjectGovernance["decisions"][number];

/**
 * The Decision register: record, edit and remove project decisions. Rows replace
 * themselves with an edit form in place, as the other registers do.
 */
export function ProjectDecisionsRegister({
  projectId,
  decisions,
}: {
  projectId: string;
  decisions: Decision[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <SectionCard
      title="Decision register"
      description="What was decided, when, and why"
    >
      {decisions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((decision) =>
                editingId === decision.id ? (
                  <tr key={decision.id} className="border-t border-border">
                    <td colSpan={4} className="p-0">
                      <EditDecisionForm
                        decision={decision}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={decision.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm">{decision.title}</td>
                    <td className="px-4 py-3 text-sm">{decision.decision}</td>
                    <td className="px-4 py-3 text-sm">
                      {formatDate(decision.decided_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(decision.id)}
                          className="border border-border px-3 py-1.5 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <DeleteDecisionButton decision={decision} />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No records yet.</p>
      )}
      <AddDecisionForm projectId={projectId} />
    </SectionCard>
  );
}

function AddDecisionForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(
    createDecisionAction.bind(null, projectId),
    undefined,
  );
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
    >
      <input
        name="title"
        required
        placeholder="Decision title"
        aria-label="Decision title"
        className={input}
      />
      <input
        name="decidedAt"
        type="date"
        aria-label="Decision date"
        className={input}
      />
      <textarea
        name="decision"
        required
        placeholder="Decision made"
        aria-label="Decision made"
        className={area}
      />
      <textarea
        name="rationale"
        placeholder="Rationale"
        aria-label="Rationale"
        className={area}
      />
      <Feedback state={state} />
      <div className="flex justify-end">
        <button
          disabled={pending}
          aria-busy={pending || undefined}
          className="unison-action-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Record decision
        </button>
      </div>
    </form>
  );
}

function EditDecisionForm({
  decision,
  onCancel,
}: {
  decision: Decision;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateDecisionAction.bind(null, decision.id),
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
      className="grid gap-3 border-t border-border bg-muted/20 p-5 md:grid-cols-2"
    >
      <input
        name="title"
        required
        defaultValue={decision.title}
        placeholder="Decision title"
        aria-label="Decision title"
        className={input}
      />
      <input
        name="decidedAt"
        type="date"
        required
        defaultValue={decision.decided_at}
        aria-label="Decision date"
        className={input}
      />
      <textarea
        name="decision"
        required
        defaultValue={decision.decision}
        placeholder="Decision made"
        aria-label="Decision made"
        className={area}
      />
      <textarea
        name="rationale"
        defaultValue={decision.rationale ?? ""}
        placeholder="Rationale"
        aria-label="Rationale"
        className={area}
      />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
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
      </div>
    </form>
  );
}

function DeleteDecisionButton({ decision }: { decision: Decision }) {
  const [state, action, pending] = useActionState(
    deleteDecisionAction.bind(null, decision.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete the decision "${decision.title}"? This cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
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
