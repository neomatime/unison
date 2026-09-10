import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { getPortfolio, getProgramme } from "../queries/portfolio-management";
import { HealthBadge, MetricCard, SectionCard } from "./delivery-primitives";
export async function ProgrammeDetailScreen({
  portfolioId,
  programmeId,
}: {
  portfolioId: string;
  programmeId: string;
}) {
  const [portfolio, programme] = await Promise.all([
    getPortfolio(portfolioId),
    getProgramme(portfolioId, programmeId),
  ]);
  if (!portfolio || !programme) notFound();
  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        parent={{
          label: portfolio.name,
          href: `/delivery/portfolio/${portfolio.id}`,
        }}
        title={programme.name}
        description={`${programme.code} · ${programme.description ?? "Programme delivery"}`}
      />
      <div className="-mt-2 mb-5 flex justify-between">
        <Link
          href={`/delivery/portfolio/${portfolio.id}`}
          className="inline-flex gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Portfolio
        </Link>
        <Link
          href={`/delivery/portfolio/${portfolio.id}/programmes/${programme.id}/edit`}
          className="inline-flex gap-2 border border-border px-3 py-2 text-xs font-semibold"
        >
          <Pencil className="size-4" />
          Edit programme
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard
          label="Status"
          value={programme.status}
          detail="Programme lifecycle"
        />
        <MetricCard
          label="Health"
          value={programme.health}
          detail="Recorded position"
        />
        <MetricCard
          label="Projects"
          value={String(programme.projectCount)}
          detail="Assigned projects"
        />
        <MetricCard
          label="Owner"
          value={programme.owner}
          detail="Accountable lead"
        />
      </div>
      <div className="mt-5">
        <SectionCard title="Programme record">
          <dl className="grid gap-5 p-5 sm:grid-cols-2">
            {[
              ["Owner", programme.owner],
              ["Sponsor", programme.sponsor],
              ["Start date", programme.startDate ?? "—"],
              ["Target end", programme.targetEndDate ?? "—"],
              ["Description", programme.description ?? "—"],
            ].map(([l, v]) => (
              <div key={l}>
                <dt className="text-xs text-muted-foreground">{l}</dt>
                <dd className="mt-1 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </>
  );
}
