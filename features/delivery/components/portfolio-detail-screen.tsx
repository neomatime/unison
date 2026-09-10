"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/workspace-header";
import type {
  PortfolioRecord,
  ProgrammeRecord,
} from "../queries/portfolio-management";
import type { getExecutiveVisibility } from "../queries/portfolio-management";
import { ExecutiveVisibility } from "./executive-visibility";
import { HealthBadge, MetricCard, SectionCard } from "./delivery-primitives";
import { assignPortfolioProjectAction } from "../actions/portfolio-management";
const tabs = ["Overview", "Programmes", "Executive visibility"] as const;
export function PortfolioDetailScreen({
  portfolio,
  programmes,
  report,
  projects,
}: {
  portfolio: PortfolioRecord;
  programmes: ProgrammeRecord[];
  report: Awaited<ReturnType<typeof getExecutiveVisibility>>;
  projects: Array<{ id: string; name: string; status: string; health: string; assigned: boolean; programmeId: string | null }>;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [assignmentState, assignmentAction, assigning] = useActionState(assignPortfolioProjectAction.bind(null, portfolio.id), undefined);
  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        parent={{ label: "Portfolio", href: "/delivery/portfolio" }}
        title={portfolio.name}
        description={`${portfolio.code}${portfolio.businessUnit ? ` · ${portfolio.businessUnit}` : ""}`}
      />
      <div className="-mt-2 mb-5 flex justify-between">
        <Link
          href="/delivery/portfolio"
          className="inline-flex gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Portfolio
        </Link>
        <Link
          href={`/delivery/portfolio/${portfolio.id}/edit`}
          className="inline-flex gap-2 border border-border px-3 py-2 text-xs font-semibold"
        >
          <Pencil className="size-4" />
          Edit portfolio
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard
          label="Status"
          value={portfolio.status}
          detail="Portfolio lifecycle"
        />
        <MetricCard
          label="Programmes"
          value={String(programmes.length)}
          detail="Persistent records"
        />
        <MetricCard
          label="Projects"
          value={String(portfolio.projectCount)}
          detail="Direct assignments"
        />
        <MetricCard
          label="Owner"
          value={portfolio.owner}
          detail="Accountable lead"
        />
      </div>
      <nav className="mt-5 flex gap-1 border-b border-border">
        {tabs.map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === x ? "border-brand text-brand" : "border-transparent text-muted-foreground"}`}
          >
            {x}
          </button>
        ))}
      </nav>
      <div className="mt-5">
        {tab === "Overview" ? (
          <SectionCard title="Portfolio summary">
            <dl className="grid gap-5 p-5 sm:grid-cols-2">
              {[
                ["Owner", portfolio.owner],
                ["Sponsor", portfolio.sponsor],
                ["Business unit", portfolio.businessUnit ?? "—"],
                ["Strategic objective", portfolio.objective ?? "—"],
                ["Start date", portfolio.startDate ?? "—"],
                ["Target end", portfolio.targetEndDate ?? "—"],
                ["Description", portfolio.description ?? "—"],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-muted-foreground">{l}</dt>
                  <dd className="mt-1 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        ) : tab === "Programmes" ? (
          <SectionCard
            title="Programmes"
            action={
              <Link
                href={`/delivery/portfolio/${portfolio.id}/programmes/new`}
                className="bg-brand px-3 py-2 text-xs font-semibold text-white"
              >
                New programme
              </Link>
            }
          >
            {programmes.length ? (
              <div className="divide-y divide-border">
                {programmes.map((p) => (
                  <Link
                    key={p.id}
                    href={`/delivery/portfolio/${portfolio.id}/programmes/${p.id}`}
                    className="flex justify-between px-5 py-4"
                  >
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.code} · {p.projectCount} projects
                      </p>
                    </div>
                    <HealthBadge>{p.health}</HealthBadge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                No programmes yet.
              </p>
            )}
            <form action={assignmentAction} className="grid gap-3 border-t border-border p-5 sm:grid-cols-[1fr_1fr_auto]">
              <select name="projectId" required className="h-10 border border-border bg-background px-3 text-sm"><option value="">Choose project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}{project.assigned?' · assigned':''}</option>)}</select>
              <select name="programmeId" className="h-10 border border-border bg-background px-3 text-sm"><option value="">Portfolio only</option>{programmes.map(programme=><option key={programme.id} value={programme.id}>{programme.name}</option>)}</select>
              <button disabled={assigning} className="bg-brand px-4 py-2 text-sm font-semibold text-white">Assign project</button>
              {assignmentState?.error?<p role="alert" className="text-sm text-destructive sm:col-span-3">{assignmentState.error}</p>:assignmentState?.success?<p role="status" className="text-sm text-success sm:col-span-3">{assignmentState.success}</p>:null}
            </form>
          </SectionCard>
        ) : (
          <ExecutiveVisibility report={report} />
        )}
      </div>
    </>
  );
}
