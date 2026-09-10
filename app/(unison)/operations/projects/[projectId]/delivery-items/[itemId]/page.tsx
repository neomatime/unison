import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkPage } from "@/components/shared/work-page";
import { getProject } from "@/features/delivery/queries/get-project";
import { listDeliveryItems } from "@/features/delivery/queries/list-delivery-items";
import { listDeliveryItemPhaseHistory } from "@/features/delivery/queries/list-delivery-item-phase-history";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; itemId: string }>;
}) {
  const { projectId, itemId } = await params;
  const [project, items, phaseHistory] = await Promise.all([
    getProject(projectId),
    listDeliveryItems(projectId),
    listDeliveryItemPhaseHistory(itemId),
  ]);
  if (!project) notFound();
  const item = items
    .flatMap((parent) => [parent, ...parent.children])
    .find((entry) => entry.id === itemId);
  if (!item) notFound();
  const returnHref = `/operations/projects/${projectId}`;
  const values = [
    ["Owner", item.ownerName],
    ["Status", item.status],
    ["Health", item.health],
    ["Current phase", item.phaseName ?? "Not set"],
    ["Start date", item.startDate ?? "Not set"],
    ["Target date", item.targetDate ?? "Not set"],
    ["Description", item.description ?? "No description"],
  ];

  return (
    <WorkPage
      category="Delivery"
      title={item.name}
      description={`Delivery record within ${project.name}.`}
      parent={{ label: project.name, href: returnHref }}
    >
      <section className="border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6">
          <div>
            <p className="text-xs tracking-[0.16em] text-brand uppercase">
              Delivery record
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.archivedAt ? "Archived" : "Active"}
            </p>
          </div>
          <Link
            href={`${returnHref}/delivery-items/${item.id}/edit`}
            className="inline-flex h-10 items-center bg-brand px-4 text-sm font-semibold text-white"
          >
            Edit record
          </Link>
        </header>
        <dl className="grid sm:grid-cols-2">
          {values.map(([label, value]) => (
            <div
              key={label}
              className="border-b border-border p-6 sm:odd:border-r"
            >
              <dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
                {label}
              </dt>
              <dd className="mt-2 text-sm font-medium text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mt-5 border border-border bg-card">
        <header className="border-b border-border p-5">
          <h2 className="font-semibold">Phase history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable progression events recorded when this delivery item
            changes phase.
          </p>
        </header>
        {phaseHistory.length ? (
          <div className="divide-y divide-border">
              {phaseHistory.map((event: { id: string; from: string; to: string; changedAt: string }) => (
              <div
                key={event.id}
                className="flex flex-wrap justify-between gap-3 px-5 py-4"
              >
                <p className="text-sm">
                  <span className="text-muted-foreground">{event.from}</span> →{" "}
                  <span className="font-semibold">{event.to}</span>
                </p>
                <time className="text-xs text-muted-foreground">
                  {new Date(event.changedAt).toLocaleString("en-ZA")}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            No phase changes have been recorded yet.
          </p>
        )}
      </section>
    </WorkPage>
  );
}
