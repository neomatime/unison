import { projects, type ProjectStatus } from '@/features/overview/data'
import { ContentPanel, ViewAllLink } from '@/components/ui/content-panel'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { InitialAvatar } from '@/components/ui/initial-avatar'

const statusTone: Record<ProjectStatus, 'brand' | 'warning'> = {
  'On Track': 'brand',
  'At Risk': 'warning',
  Delayed: 'warning',
}

export function ProjectsPanel() {
  return (
    <ContentPanel title="Projects" action={<ViewAllLink href="/operations/projects" />} bodyClassName="pb-2">
      <ul className="flex flex-col">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center gap-4 border-b border-border py-3.5 last:border-b-0"
          >
            <InitialAvatar initials={project.initials} className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                <span className="shrink-0 text-sm font-semibold text-foreground">
                  {project.progress}%
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={project.progress}
                  color={
                    project.status === 'At Risk' ? 'var(--warning)' : 'var(--chart-5)'
                  }
                />
              </div>
            </div>
            <StatusBadge tone={statusTone[project.status]}>{project.status}</StatusBadge>
          </li>
        ))}
      </ul>
    </ContentPanel>
  )
}
