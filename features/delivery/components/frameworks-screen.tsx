import Link from 'next/link'

import { EmptyState } from '@/components/shared/state-feedback'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import type { FrameworkSummary } from '../queries/list-frameworks'
import { DataPortabilityActions } from '@/features/data-portability/components/data-portability-actions'

export function FrameworksScreen({ frameworks }: { frameworks: FrameworkSummary[] }) {
  return <>
    <WorkspaceHeader
      category="Delivery"
      title="Project Frameworks"
      description="The delivery methodologies this organisation governs projects with."
      action="New Framework"
      actionHref="/delivery/frameworks/new"
    />
    <DataPortabilityActions collection="frameworks" title="Frameworks" returnHref="/delivery/frameworks" recordIds={frameworks.map((framework) => framework.id)} />
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {frameworks.length === 0 ? <EmptyState /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {['Framework', 'Type', 'Version', 'Phases', 'Projects'].map((heading) => (
                  <th key={heading} className="px-4 py-3">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {frameworks.map((framework) => (
                <tr key={framework.id} className="border-t border-border hover:bg-muted/25">
                  <td className="px-4 py-3.5">
                    <Link href={`/delivery/frameworks/${framework.id}`} className="unison-record-name text-sm text-foreground hover:text-brand">
                      {framework.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{framework.type ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{framework.version ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs">{framework.phaseCount}</td>
                  <td className="px-4 py-3.5 text-xs">{framework.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </>
}
