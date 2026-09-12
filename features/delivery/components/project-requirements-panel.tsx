"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createRequirementAction,
  deleteRequirementAction,
  updateRequirementAction,
  type RequirementActionState,
} from "../actions/requirements";
import { selectOwnerOptions, type SelectableMember } from "../form-options";
import type { RequirementRow } from "../queries/list-requirements";
import { SectionCard } from "./delivery-primitives";

// Mirrors PRIORITIES/STATUSES in features/delivery/actions/requirements.ts,
// which is the source of truth the database enforces. Restated here rather
// than imported because that file is 'use server' and a client component
// cannot import a server action file's exported non-function values across
// the boundary.
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Draft", "Approved", "In Progress", "Delivered", "Verified"];

const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand";
const area = `${input} min-h-24 py-2`;

/**
 * The Requirements tab: a single register, unlike Governance's four-tab
 * sub-nav, since this panel covers only one entity. Add and inline Edit are
 * both real, database-backed forms; Remove is a real delete behind a
 * window.confirm() gate, since it is irreversible.
 */
export function ProjectRequirementsPanel({
  projectId,
  requirements,
  members,
}: {
  projectId: string;
  requirements: RequirementRow[];
  members: SelectableMember[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <SectionCard
      title="Requirements register"
      description="What this project must deliver, tracked to a single owner and status"
    >
      {requirements.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Target date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requirements.map((requirement) =>
                editingId === requirement.id ? (
                  <tr key={requirement.id} className="border-t border-border">
                    <td colSpan={6} className="p-0">
                      <EditRequirementForm
                        requirement={requirement}
                        members={members}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={requirement.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm font-medium">
                      {requirement.title}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {requirement.priority}
                    </td>
                    <td className="px-4 py-3 text-sm">{requirement.status}</td>
                    <td className="px-4 py-3 text-sm">{requirement.owner}</td>
                    <td className="px-4 py-3 text-sm">
                      {requirement.targetDateLabel}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(requirement.id)}
                          className="border border-border px-3 py-1.5 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <DeleteRequirementButton
                          projectId={projectId}
                          requirement={requirement}
                        />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          No requirements recorded
        </p>
      )}
      <AddRequirementForm projectId={projectId} members={members} />
    </SectionCard>
  );
}

function Feedback({ state }: { state: RequirementActionState }) {
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

function AddRequirementForm({
  projectId,
  members,
}: {
  projectId: string;
  members: SelectableMember[];
}) {
  const [state, action, pending] = useActionState(
    createRequirementAction.bind(null, projectId),
    undefined,
  );
  // No current owner yet, so the retention branch never fires -- every option
  // offered is a genuinely active member.
  const addOwnerOptions = selectOwnerOptions(members);
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
    >
      <input
        name="title"
        required
        placeholder="Requirement title"
        className={input}
      />
      <div className="grid grid-cols-2 gap-3">
        <select name="priority" defaultValue="Medium" className={input}>
          {PRIORITIES.map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
        <select name="status" defaultValue="Draft" className={input}>
          {STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </div>
      <textarea
        name="description"
        placeholder="Requirement description"
        className={area}
      />
      <select name="ownerId" defaultValue="" className={input}>
        <option value="">Unassigned</option>
        {addOwnerOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <input name="targetDate" type="date" className={input} />
      <div>
        <Feedback state={state} />
        <button
          disabled={pending}
          className="mt-2 bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Add requirement
        </button>
      </div>
    </form>
  );
}

function EditRequirementForm({
  requirement,
  members,
  onCancel,
}: {
  requirement: RequirementRow;
  members: SelectableMember[];
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateRequirementAction.bind(null, requirement.id),
    undefined,
  );
  // React resets this form's uncontrolled fields to their defaultValue after
  // a successful action, and revalidatePath's refreshed props can arrive
  // after that reset -- so a form left open shows the pre-edit value (e.g.
  // status snapping back to "Draft") even though the write succeeded.
  // Closing on success avoids the stale reset entirely; matches
  // AddDependencyForm's onSaved pattern.
  useEffect(() => {
    if (state?.success) onCancel();
  }, [state, onCancel]);
  // The current owner, even one since removed from the organisation, must
  // still appear -- this is the retention pattern the delivery-item,
  // framework, phase, owner and client pickers already needed, applied here
  // because this is the first edit path this codebase has built where the
  // defect could recur for a sixth time.
  const editOwnerOptions = selectOwnerOptions(members, requirement.ownerId);
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border bg-muted/20 p-5 md:grid-cols-2"
    >
      <input
        name="title"
        required
        defaultValue={requirement.title}
        placeholder="Requirement title"
        className={input}
      />
      <div className="grid grid-cols-2 gap-3">
        <select
          name="priority"
          defaultValue={requirement.priority}
          className={input}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={requirement.status}
          className={input}
        >
          {STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </div>
      <textarea
        name="description"
        defaultValue={requirement.description ?? ""}
        placeholder="Requirement description"
        className={area}
      />
      <select
        name="ownerId"
        defaultValue={requirement.ownerId ?? ""}
        className={input}
      >
        <option value="">Unassigned</option>
        {editOwnerOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <input
        name="targetDate"
        type="date"
        defaultValue={requirement.targetDate ?? ""}
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

function DeleteRequirementButton({
  projectId,
  requirement,
}: {
  projectId: string;
  requirement: RequirementRow;
}) {
  const [state, action, pending] = useActionState(
    deleteRequirementAction.bind(null, requirement.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(`Remove "${requirement.title}"? This cannot be undone.`)
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
