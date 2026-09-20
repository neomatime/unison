"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createRiskAction,
  deleteRiskAction,
  updateRiskAction,
} from "../actions/project-governance";
import { selectOwnerOptions, type SelectableMember } from "../form-options";
import {
  RISK_IMPACTS,
  RISK_PROBABILITIES,
  RISK_STATUSES,
} from "../governance-vocabulary";
import type { ProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";
import { area, Feedback, input } from "./governance-form-parts";

type Risk = ProjectGovernance["risks"][number];

/**
 * The Risks register: full CRUD across all eight stored fields. Like the
 * Requirements register it replaces a row with its edit form in place, rather
 * than using the read-only Register the other Governance tabs share.
 */
export function ProjectRisksRegister({
  projectId,
  risks,
  members,
}: {
  projectId: string;
  risks: Risk[];
  members: SelectableMember[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <SectionCard
      title="Risk register"
      description="Project threats, exposure and mitigation ownership"
    >
      {risks.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Probability</th>
                <th className="px-4 py-3">Impact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Target date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {risks.map((risk) =>
                editingId === risk.id ? (
                  <tr key={risk.id} className="border-t border-border">
                    <td colSpan={7} className="p-0">
                      <EditRiskForm
                        risk={risk}
                        members={members}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={risk.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm font-medium">{risk.title}</td>
                    <td className="px-4 py-3 text-sm">{risk.probability}</td>
                    <td className="px-4 py-3 text-sm">{risk.impact}</td>
                    <td className="px-4 py-3 text-sm">{risk.status}</td>
                    <td className="px-4 py-3 text-sm">{risk.owner}</td>
                    <td className="px-4 py-3 text-sm">{risk.target_date ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(risk.id)}
                          className="border border-border px-3 py-1.5 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <DeleteRiskButton risk={risk} />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No risks recorded</p>
      )}
      <AddRiskForm projectId={projectId} members={members} />
    </SectionCard>
  );
}

function AddRiskForm({
  projectId,
  members,
}: {
  projectId: string;
  members: SelectableMember[];
}) {
  const [state, action, pending] = useActionState(
    createRiskAction.bind(null, projectId),
    undefined,
  );
  // No current owner yet, so the retention branch never fires: every option
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
        placeholder="Risk title"
        className={input}
      />
      <div className="grid grid-cols-3 gap-3">
        <select name="probability" defaultValue="Possible" className={input}>
          {RISK_PROBABILITIES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="impact" defaultValue="Moderate" className={input}>
          {RISK_IMPACTS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="status" defaultValue="Open" className={input}>
          {RISK_STATUSES.map((option) => (
            <option key={option}>{option}</option>
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
          Add risk
        </button>
      </div>
    </form>
  );
}

function EditRiskForm({
  risk,
  members,
  onCancel,
}: {
  risk: Risk;
  members: SelectableMember[];
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateRiskAction.bind(null, risk.id),
    undefined,
  );
  // React resets an action-bound form's uncontrolled fields to their
  // defaultValue after a successful action, and the refreshed props can arrive
  // after that reset, so a form left open shows the pre-edit value even though
  // the write succeeded. Closing on success avoids the stale reset entirely.
  useEffect(() => {
    if (state?.success) onCancel();
  }, [state, onCancel]);
  // The current owner, even one since removed from the organisation, must still
  // appear: an HTML select whose defaultValue matches no option falls back to
  // its first option (Unassigned), and saving would silently erase who owned it.
  const editOwnerOptions = selectOwnerOptions(members, risk.owner_id);
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border bg-muted/20 p-5 md:grid-cols-2"
    >
      <input
        name="title"
        required
        defaultValue={risk.title}
        placeholder="Risk title"
        className={input}
      />
      <div className="grid grid-cols-3 gap-3">
        <select name="probability" defaultValue={risk.probability} className={input}>
          {RISK_PROBABILITIES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="impact" defaultValue={risk.impact} className={input}>
          {RISK_IMPACTS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="status" defaultValue={risk.status} className={input}>
          {RISK_STATUSES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <textarea
        name="description"
        defaultValue={risk.description ?? ""}
        placeholder="Risk description"
        className={area}
      />
      <textarea
        name="mitigation"
        defaultValue={risk.mitigation ?? ""}
        placeholder="Mitigation plan"
        className={area}
      />
      <select name="ownerId" defaultValue={risk.owner_id ?? ""} className={input}>
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
        defaultValue={risk.target_date ?? ""}
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

function DeleteRiskButton({ risk }: { risk: Risk }) {
  const [state, action, pending] = useActionState(
    deleteRiskAction.bind(null, risk.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Remove "${risk.title}"? This cannot be undone.`)) {
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
