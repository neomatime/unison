"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createArtefactAction,
  deleteArtefactAction,
  updateArtefactAction,
} from "../actions/project-governance";
import type { ProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";
import { area, Feedback, input } from "./governance-form-parts";

type Artefact = ProjectGovernance["artefacts"][number];

/**
 * The Evidence register: attach, edit and remove project-scoped evidence links.
 * Rows replace themselves with an edit form in place, as the Requirements and
 * Risks registers do.
 */
export function ProjectEvidenceRegister({
  projectId,
  artefacts,
}: {
  projectId: string;
  artefacts: Artefact[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <SectionCard
      title="Governance evidence"
      description="Controlled links to artefacts supporting gates and approvals"
    >
      {artefacts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Artefact</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {artefacts.map((artefact) =>
                editingId === artefact.id ? (
                  <tr key={artefact.id} className="border-t border-border">
                    <td colSpan={4} className="p-0">
                      <EditArtefactForm
                        artefact={artefact}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={artefact.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm">
                      {artefact.external_url ? (
                        <a
                          href={artefact.external_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand"
                        >
                          {artefact.name}
                        </a>
                      ) : (
                        artefact.name
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{artefact.notes ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(artefact.created_at).toLocaleDateString("en-ZA")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(artefact.id)}
                          className="border border-border px-3 py-1.5 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <DeleteArtefactButton artefact={artefact} />
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
      <AddArtefactForm projectId={projectId} />
    </SectionCard>
  );
}

function AddArtefactForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(
    createArtefactAction.bind(null, projectId),
    undefined,
  );
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
    >
      <input
        name="name" aria-label="Artefact name"
        required
        placeholder="Artefact name"
        className={input}
      />
      <input
        name="externalUrl" aria-label="Evidence URL"
        required
        type="url"
        placeholder="https://…"
        className={input}
      />
      <textarea name="notes" aria-label="Evidence notes" placeholder="Evidence notes" className={area} />
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
  );
}

function EditArtefactForm({
  artefact,
  onCancel,
}: {
  artefact: Artefact;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateArtefactAction.bind(null, artefact.id),
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
        name="name" aria-label="Artefact name"
        required
        defaultValue={artefact.name}
        placeholder="Artefact name"
        className={input}
      />
      <input
        name="externalUrl" aria-label="Evidence URL"
        required
        type="url"
        defaultValue={artefact.external_url ?? ""}
        placeholder="https://…"
        className={input}
      />
      <textarea
        name="notes" aria-label="Evidence notes"
        defaultValue={artefact.notes ?? ""}
        placeholder="Evidence notes"
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

function DeleteArtefactButton({ artefact }: { artefact: Artefact }) {
  const [state, action, pending] = useActionState(
    deleteArtefactAction.bind(null, artefact.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Remove "${artefact.name}"? This cannot be undone, and any requirement links to it are removed too.`,
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
