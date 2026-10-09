import Link from 'next/link'

import { StatusBadge } from '@/components/ui/status-badge'
import { ProjectDocumentsWorkspace } from '@/features/delivery/components/project-documents-workspace'
import { availableClientTabs, clientTabLabels, getClientRelated, type ClientTab } from '../queries/get-client-related'

const emptyText: Record<Exclude<ClientTab, 'documents'>, string> = {
  projects: 'No projects are linked to this client yet.',
  tasks: 'No tasks are linked to this client yet.',
  commercial: 'No quotes, opportunities or invoices are linked to this client yet.',
  onboarding: 'No onboarding has been started for this client.',
}

// Server Component: only the selected tab is queried, and a tab the plan does not
// include is not offered. Everything shown is a real row linked by client_id.
export async function ClientRelatedRecords({ clientId, tab }: { clientId: string; tab?: string }) {
  const tabs = await availableClientTabs()
  const active = tabs.find((item) => item === tab) ?? tabs[0]
  const rows = active && active !== 'documents' ? await getClientRelated(clientId, active) : []
  const base = `/operations/clients/${clientId}`

  return (
    <section className="mt-5">
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Client related records">
        {tabs.map((item) => (
          <Link
            key={item}
            href={`${base}?tab=${item}`}
            scroll={false}
            aria-current={item === active ? 'page' : undefined}
            className={item === active ? 'border-b-2 border-brand px-4 py-3 text-sm font-semibold text-brand' : 'border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground'}
          >
            {clientTabLabels[item]}
          </Link>
        ))}
      </nav>
      <div className="mt-5">
        {active === 'documents' ? (
          <ProjectDocumentsWorkspace />
        ) : active ? (
          rows.length === 0 ? (
            <p className="border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{emptyText[active]}</p>
          ) : (
            <div className="overflow-x-auto border border-border bg-card">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Record</th>
                    {active === 'commercial' ? <th className="px-5 py-3 font-semibold">Type</th> : null}
                    <th className="px-5 py-3 font-semibold">Detail</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={`${row.kind ?? ''}${row.id}`}>
                      <td className="px-5 py-3 font-medium"><Link href={row.href} className="hover:underline">{row.title}</Link></td>
                      {active === 'commercial' ? <td className="px-5 py-3 text-muted-foreground">{row.kind}</td> : null}
                      <td className="px-5 py-3 text-muted-foreground">{row.detail}</td>
                      <td className="px-5 py-3"><StatusBadge>{row.status}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </section>
  )
}
