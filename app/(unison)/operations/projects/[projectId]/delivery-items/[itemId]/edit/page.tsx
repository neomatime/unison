import { notFound } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { updateDeliveryItemAction } from '@/features/delivery/actions/update-delivery-item'
import { DeliveryItemForm } from '@/features/delivery/components/delivery-item-form'
import { getProject } from '@/features/delivery/queries/get-project'
import { listDeliveryItems } from '@/features/delivery/queries/list-delivery-items'
import { listDeliveryItemFormOptions } from '@/features/delivery/queries/list-project-form-options'

export default async function Page({ params }: { params: Promise<{ projectId: string; itemId: string }> }) {
  const { projectId, itemId } = await params
  const [project, items] = await Promise.all([getProject(projectId), listDeliveryItems(projectId)])
  if (!project) notFound()
  const item = items.flatMap((parent) => [parent, ...parent.children]).find((entry) => entry.id === itemId)
  if (!item) notFound()
  const parentId = item.level === 2 ? items.find((parent) => parent.children.some((child) => child.id === item.id))?.id ?? null : null
  const options = await listDeliveryItemFormOptions(projectId, { ownerId: item.ownerId, phaseId: item.currentPhaseId })
  const returnHref = `/operations/projects/${projectId}`

  return <WorkPage category="Delivery" title={`Edit ${item.name}`} description="Update the record's delivery ownership, position and target dates." parent={{ label: project.name, href: returnHref }}>
    <section className="border border-border bg-card p-6 lg:p-8">
      <DeliveryItemForm mode="edit" level={item.level} parentId={parentId} item={{ name: item.name, description: item.description, ownerId: item.ownerId, status: item.status, health: item.health, currentPhaseId: item.currentPhaseId, startDate: item.startDate, targetDate: item.targetDate }} options={options} action={updateDeliveryItemAction.bind(null, item.id, projectId)} cancelHref={returnHref} />
    </section>
  </WorkPage>
}
