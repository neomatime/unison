"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock3 } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { createStandaloneApprovalAction } from "../actions/approval-decisions";
import type { ApprovalRecord } from "../queries/approvals";
import { HealthBadge, SectionCard } from "./delivery-primitives";

const field =
  "mt-1.5 min-h-11 w-full border border-border bg-background px-3 text-sm";
export function ApprovalForm({
  projects,
}: {
  projects: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(
    createStandaloneApprovalAction,
    undefined,
  );
  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        parent={{ label: "Approvals", href: "/delivery/approvals" }}
        title="New Approval"
        description="Create a controlled project decision request."
      />
      <form
        action={action}
        className="mx-auto max-w-4xl border border-border bg-card p-6"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            Project
            <select required name="projectId" className={field}>
              <option value="">Choose project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input required name="title" className={field} />
          </label>
          <label className="md:col-span-2">
            Description
            <textarea name="description" rows={4} className={`${field} py-3`} />
          </label>
          <label>
            Priority
            <select name="priority" className={field}>
              {["Low", "Medium", "High", "Critical"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input type="date" name="dueDate" className={field} />
          </label>
        </div>
        {state?.error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <footer className="mt-6 flex justify-end gap-2">
          <Link
            href="/delivery/approvals"
            className="border border-border px-4 py-2 text-sm"
          >
            Cancel
          </Link>
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
        </footer>
      </form>
    </>
  );
}

export function ApprovalDetail({ approval }: { approval: ApprovalRecord }) {
  const href = (action: string) =>
    `/delivery/approvals/${approval.id}/review?action=${action}`;
  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        parent={{ label: "Approvals", href: "/delivery/approvals" }}
        title={approval.title}
        description={approval.projectName}
      />
      <div className="-mt-2 mb-5 flex justify-between">
        <Link
          href="/delivery/approvals"
          className="inline-flex gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Approvals
        </Link>
        <HealthBadge>{approval.status}</HealthBadge>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <SectionCard title="Approval summary">
            <dl className="grid gap-4 p-5 sm:grid-cols-2">
              {[
                ["Project", approval.projectName],
                ["Priority", approval.priority],
                ["Due date", approval.dueDate ?? "—"],
                [
                  "Requested",
                  new Date(approval.createdAt).toLocaleString("en-ZA"),
                ],
                ["Approver", approval.approver],
                ["Description", approval.description ?? "—"],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-muted-foreground">{l}</dt>
                  <dd className="mt-1 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
          <SectionCard title="Evidence">
            {approval.artefacts.length ? (
              <div className="divide-y divide-border">
                {approval.artefacts.map((file) => (
                  <a
                    key={file.id}
                    href={file.url ?? "#"}
                    className="flex gap-3 px-5 py-4 text-sm font-semibold text-brand"
                  >
                    <Check className="size-4" />
                    {file.name}
                  </a>
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                No evidence linked yet.
              </p>
            )}
          </SectionCard>
          <SectionCard title="Decision history">
            {approval.decisions.length ? (
              <div className="divide-y divide-border">
                {approval.decisions.map((item) => (
                  <div key={item.id} className="flex gap-3 px-5 py-4">
                    <Clock3 className="size-4" />
                    <div>
                      <p className="text-sm font-semibold">{item.action}</p>
                      {item.comment ? (
                        <p className="text-sm text-muted-foreground">
                          {item.comment}
                        </p>
                      ) : null}
                    </div>
                    <time className="ml-auto text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString("en-ZA")}
                    </time>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                No decision events yet.
              </p>
            )}
          </SectionCard>
        </div>
        <SectionCard title="Record decision">
          <div className="space-y-2 p-5">
            {[
              ["approve", "Approve"],
              ["changes", "Request changes"],
              ["reject", "Reject"],
              ["withdraw", "Withdraw"],
            ].map(([action, label]) => (
              <Link
                key={action}
                href={href(action)}
                className="block border border-border px-4 py-2.5 text-center text-sm font-semibold"
              >
                {label}
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
