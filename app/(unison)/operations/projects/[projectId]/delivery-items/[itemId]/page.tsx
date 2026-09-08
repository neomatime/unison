import Link from 'next/link'
import { notFound } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { getProject } from '@/features/delivery/queries/get-project'
import { listDeliveryItems } from '@/features/delivery/queries/list-delivery-items'

export default async function Page({ params }: { params: Promise<{ projectId: string; itemId: string }> }) {
  const { projectId, itemId } = await params
  const [project, items] = await Promise.all([getProject(projectId), listDeliveryItems(projectId)])
  if (!project) notFound()
  const item = items.flatMap((parent) => [parent, ...parent.children]).find((entry) => entry.id === itemId)
  if (!item) notFound()
  const returnHref = `/operations/projects/${projectId}`
  const values = [['Owner', item.ownerName], ['Status', item.status], ['Health', item.health], ['Current phase', item.phaseName ?? 'Not set'], ['Start date', item.startDate ?? 'Not set'], ['Target date', item.targetDate ?? 'Not set'], ['Description', item.description ?? 'No description']]

  return <WorkPage category="Delivery" title={item.name} description={`Delivery record within ${project.name}.`} parent={{ label: project.name, href: returnHref }}>
    <section className="border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6"><div><p className="text-xs tracking-[0.16em] text-brand uppercase">Delivery record</p><p className="mt-1 text-sm text-muted-foreground">{item.archivedAt ? 'Archived' : 'Active'}</p></div><Link href={`${returnHref}/delivery-items/${item.id}/edit`} className="inline-flex h-10 items-center bg-brand px-4 text-sm font-semibold text-white">Edit record</Link></header>
      <dl className="grid sm:grid-cols-2">{values.map(([label, value]) => <div key={label} className="border-b border-border p-6 sm:odd:border-r"><dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{label}</dt><dd className="mt-2 text-sm font-medium text-foreground">{value}</dd></div>)}</dl>
    </section>
  </WorkPage>
}
