"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createApprovalAction,
  deleteApprovalAction,
  updateApprovalAction,
} from "../actions/project-governance";
import { APPROVAL_PRIORITIES } from "../governance-vocabulary";
import type { ProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";
import { area, Feedback, formatDate, input } from "./governance-form-parts";

type Approval = ProjectGovernance["approvals"][number];

/**
 * The Governance approvals register. Only Draft approvals can be edited or
 * removed; once submitted a row is read-only and its history is append-only.
 */
export function ProjectApprovalsRegister({
  projectId,
  approvals,
}: {
  projectId: string;
  approvals: Approval[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <SectionCard
      title="Governance approvals"
      description="Controlled gate and project decisions with durable status history"
    >
      {approvals.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Approval</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((approval) =>
                editingId === approval.id && approval.status === "Draft" ? (
                  <tr key={approval.id} className="border-t border-border">
                    <td colSpan={5} className="p-0">
                      <EditApprovalForm
                        approval={approval}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={approval.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm">{approval.title}</td>
                    <td className="px-4 py-3 text-sm">{approval.priority}</td>
                    <td className="px-4 py-3 text-sm">
                      {approval.due_date ? formatDate(approval.due_date) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">{approval.status}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {approval.status === "Draft" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(approval.id)}
                            className="border border-border px-3 py-1.5 text-xs font-semibold"
                          >
                            Edit
                          </button>
                          <DeleteApprovalButton approval={approval} />
                        </div>
                      ) : null}
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
      <AddApprovalForm projectId={projectId} />
    </SectionCard>
  );
}

function PriorityOptions() {
  return (
    <>
      {APPROVAL_PRIORITIES.map((priority) => (
        <option key={priority} value={priority}>
          {priority}
        </option>
      ))}
    </>
  );
}

function AddApprovalForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(
    createApprovalAction.bind(null, projectId),
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
        placeholder="Approval title"
        aria-label="Approval title"
        className={input}
      />
      <select
        name="priority"
        defaultValue="Medium"
        aria-label="Approval priority"
        className={input}
      >
        <PriorityOptions />
      </select>
      <textarea
        name="description"
        placeholder="Decision context"
        aria-label="Decision context"
        className={area}
      />
      <input
        name="dueDate"
        type="date"
        aria-label="Due date"
        className={input}
      />
      <Feedback state={state} />
      <div className="flex justify-end gap-2">
        <button
          name="intent"
          value="draft"
          disabled={pending}
          aria-busy={pending || undefined}
          className="unison-action-control border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          Save draft
        </button>
        <button
          name="intent"
          value="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className="unison-action-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Submit
        </button>
      </div>
    </form>
  );
}

function EditApprovalForm({
  approval,
  onCancel,
}: {
  approval: Approval;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateApprovalAction.bind(null, approval.id),
    undefined,
  );
  // Close on success: React resets an action-bound form's uncontrolled fields to
  // their defaultValue afterwards, and a submitted row is no longer editable.
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
        defaultValue={approval.title}
        placeholder="Approval title"
        aria-label="Approval title"
        className={input}
      />
      <select
        name="priority"
        defaultValue={approval.priority}
        aria-label="Approval priority"
        className={input}
      >
        <PriorityOptions />
      </select>
      <textarea
        name="description"
        defaultValue={approval.description ?? ""}
        placeholder="Decision context"
        aria-label="Decision context"
        className={area}
      />
      <input
        name="dueDate"
        type="date"
        defaultValue={approval.due_date ?? ""}
        aria-label="Due date"
        className={input}
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
            name="intent"
            value="draft"
            disabled={pending}
            aria-busy={pending || undefined}
            className="unison-action-control border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Save draft
          </button>
          <button
            name="intent"
            value="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="unison-action-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Submit
          </button>
        </div>
      </div>
    </form>
  );
}

function DeleteApprovalButton({ approval }: { approval: Approval }) {
  const [state, action, pending] = useActionState(
    deleteApprovalAction.bind(null, approval.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete the draft "${approval.title}"? This cannot be undone.`,
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
