"use client";
import { useActionState } from "react";
import Link from "next/link";
import { WorkPage } from "@/components/shared/work-page";
import { recordApprovalDecisionAction } from "../actions/approval-decisions";
import type { ApprovalRecord } from "../queries/approvals";

export type ApprovalAction = "approve" | "changes" | "reject" | "withdraw";
const copy: Record<ApprovalAction, string> = {
  approve: "Approve request",
  changes: "Request changes",
  reject: "Reject approval",
  withdraw: "Withdraw approval",
};
export function ApprovalDecisionPage({
  approval,
  action,
}: {
  approval: ApprovalRecord;
  action: ApprovalAction;
}) {
  const [state, formAction, pending] = useActionState(
    recordApprovalDecisionAction.bind(null, approval.id, action),
    undefined,
  );
  const href = `/delivery/approvals/${approval.id}`;
  return (
    <WorkPage
      category="Delivery"
      title={copy[action]}
      description="Record an accountable, durable governance decision."
      parent={{ label: approval.title, href }}
    >
      <form action={formAction} className="border border-border bg-card">
        <header className="border-b border-border p-6">
          <h2 className="font-semibold">{approval.title}</h2>
          <p className="text-sm text-muted-foreground">
            {approval.projectName}
          </p>
        </header>
        <div className="p-6">
          <label className="text-sm font-medium">
            Decision note{action !== "approve" ? " *" : ""}
            <textarea
              required={action !== "approve"}
              name="comment"
              rows={5}
              className="mt-2 w-full border border-border bg-background p-3"
            />
          </label>
          {state?.error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border p-5">
          <Link href={href} className="border border-border px-4 py-2 text-sm">
            Cancel
          </Link>
          <button
            disabled={pending}
            className="bg-brand px-5 py-2 text-sm font-semibold text-white"
          >
            Confirm decision
          </button>
        </footer>
      </form>
    </WorkPage>
  );
}
