import { notFound } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { createDeliveryItemAction } from '@/features/delivery/actions/create-delivery-item'
import { DeliveryItemForm } from '@/features/delivery/components/delivery-item-form'
import { getProject } from '@/features/delivery/queries/get-project'
import { listDeliveryItems } from '@/features/delivery/queries/list-delivery-items'
import { listDeliveryItemFormOptions } from '@/features/delivery/queries/list-project-form-options'
import { levelLabel } from '@/features/delivery/schemas/framework'

export default async function Page({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ level?: string; parentId?: string }> }) {
  const [{ projectId }, query] = await Promise.all([params, searchParams])
  const project = await getProject(projectId)
  if (!project) notFound()

  const level = query.level === '2' ? 2 : 1
  const items = level === 2 ? await listDeliveryItems(projectId) : []
  const parent = level === 2 ? items.find((item) => item.id === query.parentId && !item.archivedAt) : undefined
  if (level === 2 && !parent) notFound()

  const options = await listDeliveryItemFormOptions(projectId)
  const label = levelLabel(level, { level1Label: project.frameworks?.level_1_label ?? null, level2Label: project.frameworks?.level_2_label ?? null })
  const returnHref = `/operations/projects/${projectId}`

  return <WorkPage category="Delivery" title={`Add ${label}`} description={parent ? `Create a governed delivery record beneath ${parent.name}.` : `Create a governed delivery record for ${project.name}.`} parent={{ label: project.name, href: returnHref }} guidance={<><p className="font-semibold text-foreground">Delivery structure</p><p className="mt-2">Ownership, status, health, phase and dates are captured together so the record has a complete delivery context.</p></>}>
    <section className="border border-border bg-card p-6 lg:p-8">
      <DeliveryItemForm mode="create" level={level} parentId={parent?.id ?? null} options={options} action={createDeliveryItemAction.bind(null, projectId)} cancelHref={returnHref} />
    </section>
  </WorkPage>
}
