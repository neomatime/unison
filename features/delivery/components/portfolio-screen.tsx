import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { RecordCollectionWorkspace } from "@/features/product-ui/components/record-collection-workspace";
import { listPortfolios } from "../queries/portfolio-management";
import { MetricCard } from "./delivery-primitives";
export async function PortfolioScreen() {
  const portfolios = await listPortfolios();
  const active = portfolios.filter((p) => !p.archivedAt);
  const records = active.map((p) => ({
    id: p.id,
    name: p.name,
    context: p.description ?? p.objective ?? "—",
    code: p.code,
    owner: p.owner,
    programmes: String(p.programmeCount),
    projects: String(p.projectCount),
    status: p.status,
    updated: p.targetEndDate ?? "—",
  }));
  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        title="Project Portfolio"
        description="Persistent portfolios, programmes and executive delivery visibility."
        action="New Portfolio"
        actionHref="/delivery/portfolio/new"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Active portfolios"
          value={String(active.length)}
          detail="Governed portfolio records"
        />
        <MetricCard
          label="Programmes"
          value={String(active.reduce((n, p) => n + p.programmeCount, 0))}
          detail="Across active portfolios"
        />
        <MetricCard
          label="Projects"
          value={String(active.reduce((n, p) => n + p.projectCount, 0))}
          detail="Directly assigned"
        />
      </div>
      <div className="mt-5">
        <RecordCollectionWorkspace
          config={{
            title: "Portfolio Register",
            singular: "Portfolio",
            description: "Persisted strategic delivery portfolios.",
            primaryAction: "New Portfolio",
            records,
            recordHrefBase: "/delivery/portfolio",
            filters: ["Owner", "Status"],
            columns: [
              { id: "name", label: "Portfolio" },
              { id: "code", label: "Code" },
              { id: "owner", label: "Owner" },
              { id: "programmes", label: "Programmes" },
              { id: "projects", label: "Projects" },
              { id: "status", label: "Status" },
            ],
            fields: [],
            detailTabs: ["Overview", "Programmes", "Executive visibility"],
            contextualActions: [],
            allowImport: true,
            portableCollection: "portfolios",
            emptyDescription:
              "Create the first portfolio to organise programmes and executive reporting.",
          }}
        />
      </div>
    </>
  );
}
