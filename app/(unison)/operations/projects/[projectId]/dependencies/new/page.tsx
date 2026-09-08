import { notFound } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { AddDependencyForm } from '@/features/delivery/components/project-dependencies-panel'
import { getProject } from '@/features/delivery/queries/get-project'
import { listDependencyFormOptions } from '@/features/delivery/queries/list-dependency-form-options'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const project = await getProject(projectId)
  if (!project) notFound()
  const options = await listDependencyFormOptions(projectId)
  const returnHref = `/operations/projects/${projectId}`

  return <WorkPage category="Delivery" title="Add prerequisite" description={`Define a governed project dependency for ${project.name}.`} parent={{ label: project.name, href: returnHref }} guidance={<><p className="font-semibold text-foreground">Dependency ownership</p><p className="mt-2">Choose the prerequisite, required state, accountable owner, criticality and required-by date together.</p></>}>
    <section className="border border-border bg-card p-6 lg:p-8">
      <AddDependencyForm projectId={projectId} options={options} cancelHref={returnHref} />
    </section>
  </WorkPage>
}
