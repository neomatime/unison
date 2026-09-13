"use client";

import { useActionState } from "react";
import {
  linkDeliveryItemAction,
  linkEvidenceAction,
  unlinkDeliveryItemAction,
  unlinkEvidenceAction,
  type TraceabilityActionState,
} from "../actions/traceability";
import { deriveCoverage, unlinkedOptions, type Coverage } from "../traceability-options";
import type { DeliveryItemNode } from "../queries/list-delivery-items";
import type { TraceabilityRow } from "../queries/list-traceability";
import { SectionCard } from "./delivery-primitives";

type Option = { id: string; name: string };
type FieldName = "deliveryItemId" | "evidenceId";
type LinkAction = (
  requirementId: string,
  previous: TraceabilityActionState,
  form: FormData,
) => Promise<TraceabilityActionState>;

const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand";

// Mirrors the three Coverage values in traceability-options.ts. Restated here
// rather than computed, since a lookup table is clearer than branching CSS.
const badgeClass: Record<Coverage, string> = {
  "Not linked": "bg-muted text-muted-foreground",
  Built: "bg-brand/10 text-brand",
  Verified: "bg-success/10 text-success",
};

export function ProjectTraceabilityPanel({
  traceability,
  deliveryItems,
  evidence,
}: {
  traceability: TraceabilityRow[];
  deliveryItems: DeliveryItemNode[];
  evidence: Option[];
}) {
  const allDeliveryItems: Option[] = deliveryItems.flatMap((item) => [
    { id: item.id, name: item.name },
    ...item.children.map((child) => ({ id: child.id, name: child.name })),
  ]);
  const deliveryItemNames = new Map(allDeliveryItems.map((item) => [item.id, item.name]));
  const evidenceNames = new Map(evidence.map((item) => [item.id, item.name]));

  return (
    <SectionCard
      title="Traceability"
      description="Which delivery items build each requirement, and what evidence verifies it"
    >
      {traceability.length ? (
        <div className="divide-y divide-border">
          {traceability.map((row) => {
            const coverage = deriveCoverage(row.deliveryItemIds.length, row.evidenceIds.length);
            return (
              <div key={row.requirementId} className="grid gap-4 p-5 md:grid-cols-2">
                <div className="flex items-center justify-between md:col-span-2">
                  <h3 className="text-sm font-semibold">{row.title}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass[coverage]}`}>
                    {coverage}
                  </span>
                </div>
                <LinkedItems
                  label="Delivery items"
                  requirementId={row.requirementId}
                  linkedIds={row.deliveryItemIds}
                  names={deliveryItemNames}
                  options={unlinkedOptions(allDeliveryItems, row.deliveryItemIds)}
                  fieldName="deliveryItemId"
                  linkAction={linkDeliveryItemAction}
                  unlinkAction={unlinkDeliveryItemAction}
                  emptyLabel="No delivery items linked"
                  addLabel="Add delivery item"
                />
                <LinkedItems
                  label="Evidence"
                  requirementId={row.requirementId}
                  linkedIds={row.evidenceIds}
                  names={evidenceNames}
                  options={unlinkedOptions(evidence, row.evidenceIds)}
                  fieldName="evidenceId"
                  linkAction={linkEvidenceAction}
                  unlinkAction={unlinkEvidenceAction}
                  emptyLabel="No evidence linked"
                  addLabel="Add evidence"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No requirements recorded</p>
      )}
    </SectionCard>
  );
}

function LinkedItems({
  label,
  requirementId,
  linkedIds,
  names,
  options,
  fieldName,
  linkAction,
  unlinkAction,
  emptyLabel,
  addLabel,
}: {
  label: string;
  requirementId: string;
  linkedIds: string[];
  names: Map<string, string>;
  options: Option[];
  fieldName: FieldName;
  linkAction: LinkAction;
  unlinkAction: LinkAction;
  emptyLabel: string;
  addLabel: string;
}) {
  const [linkState, linkFormAction, linkPending] = useActionState(
    linkAction.bind(null, requirementId),
    undefined,
  );
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h4>
      <ul className="mt-2 space-y-1">
        {linkedIds.length ? (
          linkedIds.map((id) => (
            <UnlinkRow
              key={id}
              requirementId={requirementId}
              targetId={id}
              name={names.get(id) ?? "Unknown"}
              fieldName={fieldName}
              unlinkAction={unlinkAction}
            />
          ))
        ) : (
          <li className="text-sm text-muted-foreground">{emptyLabel}</li>
        )}
      </ul>
      {options.length ? (
        <form action={linkFormAction} className="mt-2 flex gap-2">
          <select name={fieldName} required defaultValue="" className={input}>
            <option value="" disabled>
              {addLabel}
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <button
            disabled={linkPending}
            className="shrink-0 border border-border px-3 py-1.5 text-xs font-semibold"
          >
            Link
          </button>
        </form>
      ) : null}
      {linkState?.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {linkState.error}
        </p>
      ) : linkState?.success ? (
        <p role="status" className="mt-1 text-xs text-success">
          {linkState.success}
        </p>
      ) : null}
    </div>
  );
}

function UnlinkRow({
  requirementId,
  targetId,
  name,
  fieldName,
  unlinkAction,
}: {
  requirementId: string;
  targetId: string;
  name: string;
  fieldName: FieldName;
  unlinkAction: LinkAction;
}) {
  const [state, action, pending] = useActionState(unlinkAction.bind(null, requirementId), undefined);
  return (
    <li className="text-sm">
      <form action={action} className="flex items-center justify-between gap-2">
        <input type="hidden" name={fieldName} value={targetId} />
        <span>{name}</span>
        <button type="submit" disabled={pending} className="text-xs font-semibold text-destructive">
          Unlink
        </button>
      </form>
      {state?.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      ) : state?.success ? (
        <p role="status" className="mt-1 text-xs text-success">
          {state.success}
        </p>
      ) : null}
    </li>
  );
}
