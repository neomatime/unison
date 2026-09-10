import type { getExecutiveVisibility } from "../queries/portfolio-management";
import { MetricCard, SectionCard } from "./delivery-primitives";
type Report = Awaited<ReturnType<typeof getExecutiveVisibility>>;
export function ExecutiveVisibility({ report }: { report: Report }) {
  const pending = report.approvals.filter((x: any) => x.status === "Pending");
  const approved = report.approvals.filter((x: any) => x.status === "Approved");
  const openRisks = report.risks;
  const criticalDeps = report.dependencies.filter(
    (x: any) =>
      x.criticality === "Critical" ||
      ["At Risk", "Critical"].includes(x.prerequisite?.health),
  );
  const gateCoverage = report.gates.length
    ? Math.round(
        (report.gates.filter((g: any) =>
          report.evidence.some((e: any) => e.gate_id === g.id),
        ).length /
          report.gates.length) *
          100,
      )
    : 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Pending approvals"
          value={String(pending.length)}
          detail={`${approved.length} approved`}
        />
        <MetricCard
          label="Governance gates"
          value={String(report.gates.length)}
          detail={`${gateCoverage}% evidence coverage`}
        />
        <MetricCard
          label="Evidence"
          value={String(report.evidence.length)}
          detail="Controlled artefacts"
        />
        <MetricCard
          label="Open risks"
          value={String(openRisks.length)}
          detail="Across delivery"
        />
        <MetricCard
          label="Dependency impact"
          value={String(criticalDeps.length)}
          detail="Critical or exposed"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ReportList
          title="Approval position"
          empty="No approval requests."
          rows={report.approvals.map((x: any) => [
            x.projects?.name ?? "Delivery governance",
            x.status,
            x.due_date ?? "No due date",
          ])}
        />
        <ReportList
          title="Gate and evidence coverage"
          empty="No governance gates."
          rows={report.gates.map((g: any) => [
            g.name,
            report.evidence.some((e: any) => e.gate_id === g.id)
              ? "Evidence attached"
              : "Evidence outstanding",
            g.approval_required ? "Approval required" : "Advisory",
          ])}
        />
        <ReportList
          title="Risk and decision intelligence"
          empty="No open risks or decisions."
          rows={[
            ...report.risks.map((r: any) => [
              r.title,
              `${r.probability} / ${r.impact}`,
              r.projects?.name ?? "Project",
            ]),
            ...report.decisions
              .slice(0, 8)
              .map((d: any) => [
                d.title,
                "Decision recorded",
                d.projects?.name ?? d.decided_at,
              ]),
          ]}
        />
        <ReportList
          title="Dependency impact"
          empty="No project dependencies."
          rows={report.dependencies.map((d: any) => [
            `${d.dependent?.name} depends on ${d.prerequisite?.name}`,
            d.criticality,
            `${d.prerequisite?.status} / ${d.prerequisite?.health}`,
          ])}
        />
      </div>
    </div>
  );
}
function ReportList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: string[][];
}) {
  return (
    <SectionCard title={title}>
      {rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((r, i) => (
            <div
              key={`${r[0]}-${i}`}
              className="grid grid-cols-[1fr_auto] gap-2 px-5 py-4"
            >
              <p className="text-sm font-semibold">{r[0]}</p>
              <p className="text-xs text-muted-foreground">{r[1]}</p>
              <p className="col-span-2 text-xs text-muted-foreground">{r[2]}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">{empty}</p>
      )}
    </SectionCard>
  );
}
