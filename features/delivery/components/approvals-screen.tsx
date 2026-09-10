import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { RecordCollectionWorkspace } from "@/features/product-ui/components/record-collection-workspace";
import { listApprovals } from "../queries/approvals";
import { MetricCard } from "./delivery-primitives";

export async function ApprovalsScreen() {
  const approvals = await listApprovals();
  const today = new Date().toISOString().slice(0, 10);
  const pending = approvals.filter((x) => x.status === "Pending"),
    approved = approvals.filter((x) => x.status === "Approved"),
    changes = approvals.filter((x) => x.status === "Changes Requested");
  const records = approvals.map((item) => ({
    id: item.id,
    name: item.title,
    context: item.description ?? item.projectName,
    project: item.projectName,
    owner: item.requestedBy,
    approver: item.approver,
    priority: item.priority,
    requested: new Date(item.createdAt).toLocaleDateString("en-ZA"),
    due: item.dueDate ?? "—",
    status: item.status,
    updated: new Date(item.createdAt).toLocaleDateString("en-ZA"),
  }));
  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        title="Approvals"
        description="Govern project and framework decisions with durable evidence and decision history."
        action="New Approval"
        actionHref="/delivery/approvals/new"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pending"
          value={String(pending.length)}
          detail="Awaiting decision"
        />
        <MetricCard
          label="Due today"
          value={String(pending.filter((x) => x.dueDate === today).length)}
          detail="Requires attention"
        />
        <MetricCard
          label="Overdue"
          value={String(
            pending.filter((x) => x.dueDate && x.dueDate < today).length,
          )}
          detail="Past due date"
        />
        <MetricCard
          label="Approved"
          value={String(approved.length)}
          detail={`${changes.length} changes requested`}
        />
      </div>
      <div className="mt-5">
        <RecordCollectionWorkspace
          config={{
            title: "Approval Register",
            singular: "Approval",
            description:
              "Persisted governance requests and their current decision state.",
            primaryAction: "New Approval",
            records,
            recordHrefBase: "/delivery/approvals",
            filters: ["Project", "Priority", "Status"],
            columns: [
              { id: "name", label: "Approval" },
              { id: "project", label: "Project" },
              { id: "owner", label: "Requested By" },
              { id: "approver", label: "Approver" },
              { id: "priority", label: "Priority" },
              { id: "due", label: "Due Date" },
              { id: "status", label: "Status" },
            ],
            fields: [],
            detailTabs: ["Summary", "Evidence", "Decision History"],
            contextualActions: [],
            emptyDescription:
              "Create the first approval request to begin a governed decision process.",
          }}
        />
      </div>
    </>
  );
}
