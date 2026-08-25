import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'

import { deliveryProjects } from '../data'
import { HealthBadge, TableProgress } from './delivery-primitives'

export function ProjectTable({ limit }: { limit?: number }) {
  const records = limit ? deliveryProjects.slice(0, limit) : deliveryProjects
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[1120px] text-left">
      <thead><tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {['Project', 'Framework', 'Current phase', 'Owner', 'Health', 'Next gate', 'Blockers', 'Target go-live', '% complete', ''].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
      </tr></thead>
      <tbody>{records.map((project) => <tr key={project.id} className="border-t border-border hover:bg-muted/25">
        <td className="px-4 py-3.5"><Link href={`/operations/projects/${project.id}`} className="text-sm font-semibold text-foreground hover:text-brand">{project.name}</Link><p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{project.dependencies} dependencies</p></td>
        <td className="max-w-48 px-4 py-3.5 text-xs text-muted-foreground">{project.framework}</td>
        <td className="px-4 py-3.5 text-xs font-medium">{project.phase}</td>
        <td className="px-4 py-3.5 text-xs">{project.owner}</td>
        <td className="px-4 py-3.5"><HealthBadge>{project.health}</HealthBadge></td>
        <td className="px-4 py-3.5 text-xs font-medium">{project.nextGate}</td>
        <td className="px-4 py-3.5 text-xs"><span className={project.blockers ? 'font-semibold text-danger' : 'text-muted-foreground'}>{project.blockers}</span></td>
        <td className="px-4 py-3.5 text-xs whitespace-nowrap">{project.dueDate}</td>
        <td className="px-4 py-3.5"><TableProgress value={project.progress} /></td>
        <td className="px-4 py-3.5"><Link href={`/operations/projects/${project.id}`} aria-label={`Open ${project.name}`} className="text-muted-foreground hover:text-foreground"><MoreHorizontal className="size-4" /></Link></td>
      </tr>)}</tbody>
    </table>
  </div>
}
