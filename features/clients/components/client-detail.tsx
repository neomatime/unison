import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Pencil } from 'lucide-react'

import { ArchiveConfirmation, ArchiveTrigger } from '@/components/shared/archive-confirmation'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { StatusDot } from '@/components/ui/status-dot'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import type { RecordWorkspace } from '@/features/crm-workspace/types'
import { formatDate } from '@/lib/utils'
import { archiveClientAction } from '../actions/archive-client'
import { engagementLabel } from '../engagement'
import { ClientDocuments } from './client-documents'
import type { ClientRecord } from '../queries/get-client'

// A Server Component, deliberately: the archive confirmation is a two-step,
// plain-HTML flow rather than a client-side dialog, so it works identically
// with or without JS having loaded. See components/shared/archive-confirmation.
export function ClientDetail({ client, workspace, confirmArchive, archiveError }: { client: ClientRecord; workspace: RecordWorkspace; confirmArchive?: boolean; archiveError?: boolean }) {
  const archived = Boolean(client.archived_at)
  const detailHref = `/operations/clients/${client.id}`
  const facts = ([
    ['Client health', client.health],
    ['Industry', client.industry],
    ['Website', client.website],
    ['Primary contact', client.contact_name],
    ['Contact email', client.contact_email],
    ['Contact phone', client.contact_phone],
    ['Primary engagement', engagementLabel(client.engagement_type)],
    ['Billing email', client.billing_email],
    ['Last activity', formatDate(client.updated_at)],
    ['Created', formatDate(client.created_at)],
    ['Archived', client.archived_at ? formatDate(client.archived_at) : null],
    ['Notes', client.notes],
  ] as Array<[string, string | null | undefined]>).filter((fact): fact is [string, string] => Boolean(fact[1]) && fact[1] !== '—')

  return <>
    <WorkspaceHeader category="Operations" parent={{ label: 'Clients', href: '/operations/clients' }} title={client.name} />
    <Link href="/operations/clients" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to Clients</Link>

    {archiveError ? (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        The client could not be archived. Please try again.
      </div>
    ) : null}

    {!archived && confirmArchive ? (
      <section className="border border-border bg-card p-6">
        <ArchiveConfirmation
          recordName={client.name}
          cancelHref={detailHref}
          action={archiveClientAction.bind(null, client.id)}
          description="This removes it from the active clients list. There is no undo through the UI."
          confirmLabel="Yes, archive client"
        />
      </section>
    ) : null}

    {!archived && !confirmArchive ? (
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <Link href={`${detailHref}/edit`} className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm font-medium"><Pencil className="size-4" />Edit</Link>
        <ArchiveTrigger detailHref={detailHref} label="Archive Client" />
      </div>
    ) : null}

    <div className="mt-5 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <aside aria-label="Client details" className="border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Details</h2>
          <StatusDot status={client.status} />
        </div>
        <dl className="mt-4 space-y-5">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm break-words whitespace-pre-wrap text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
      <div className="min-w-0 space-y-5">
        <div className="-mt-5">
          <RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />
        </div>
        {!archived ? <ClientDocuments /> : null}
      </div>
    </div>
  </>
}
