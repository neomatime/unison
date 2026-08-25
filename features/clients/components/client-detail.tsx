import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Pencil } from 'lucide-react'

import { ArchiveConfirmation, ArchiveTrigger } from '@/components/shared/archive-confirmation'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { DetailTile, SummaryTile } from '@/components/ui/record-tiles'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/utils'
import { archiveClientAction } from '../actions/archive-client'
import { ClientRelationshipWorkspace } from './client-relationship-workspace'
import type { ClientRecord } from '../queries/get-client'

function statusTone(status: string): 'brand' | 'warning' | 'info' | 'neutral' {
  if (status === 'Active') return 'brand'
  if (status === 'Archived') return 'neutral'
  return 'info'
}

// A Server Component, deliberately: the archive confirmation is a two-step,
// plain-HTML flow rather than a client-side dialog, so it works identically
// with or without JS having loaded. See components/shared/archive-confirmation.
export function ClientDetail({ client, confirmArchive, archiveError }: { client: ClientRecord; confirmArchive?: boolean; archiveError?: boolean }) {
  const archived = Boolean(client.archived_at)
  const detailHref = `/operations/clients/${client.id}`

  return <>
    <WorkspaceHeader category="Operations" parent={{ label: 'Clients', href: '/operations/clients' }} title={client.name} />
    <Link href="/operations/clients" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to Clients</Link>

    {archiveError ? (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        The client could not be archived. Please try again.
      </div>
    ) : null}

    <section className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">{client.name}</h2>
            <StatusBadge tone={statusTone(client.status)}>{client.status}</StatusBadge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {client.contact_name ?? 'No primary contact on file'} · Last activity {formatDate(client.updated_at)}
          </p>
        </div>
        {!archived && !confirmArchive ? (
          <div className="flex flex-wrap gap-2">
            <Link href={`${detailHref}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium"><Pencil className="size-4" />Edit</Link>
            <ArchiveTrigger detailHref={detailHref} label="Archive Client" />
          </div>
        ) : null}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Status" value={client.status} />
        <SummaryTile label="Client health" value={client.health} />
        {/* No projects table yet — an em dash, not a fabricated 0. */}
        <SummaryTile label="Active projects" value={null} />
        <SummaryTile label="Last activity" value={formatDate(client.updated_at)} />
      </div>
      {!archived && confirmArchive ? (
        <ArchiveConfirmation
          recordName={client.name}
          cancelHref={detailHref}
          action={archiveClientAction.bind(null, client.id)}
          description="This removes it from the active clients list. There is no undo through the UI."
          confirmLabel="Yes, archive client"
        />
      ) : null}
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-3">
      <section className="rounded-xl border border-border bg-card p-6 xl:col-span-2">
        <h3 className="font-semibold">Company</h3>
        <p className="mt-1 text-sm text-muted-foreground">Core details on record for {client.name}.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <DetailTile label="Industry" value={client.industry} />
          <DetailTile label="Website" value={client.website} />
          <DetailTile label="Primary contact" value={client.contact_name} />
          <DetailTile label="Contact email" value={client.contact_email} />
          <DetailTile label="Contact phone" value={client.contact_phone} />
          <DetailTile label="Primary engagement" value={client.service} />
          <DetailTile label="Billing email" value={client.billing_email} />
        </div>
        {client.notes ? (
          <div className="mt-6">
            <p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">Notes</p>
            <p className="mt-1 text-sm">{client.notes}</p>
          </div>
        ) : null}
      </section>
      <aside className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold">Record</h3>
        <div className="mt-5 space-y-4 text-sm">
          <div><p className="text-xs text-muted-foreground">Created</p><p className="mt-1 font-medium">{formatDate(client.created_at)}</p></div>
          {client.archived_at ? <div><p className="text-xs text-muted-foreground">Archived</p><p className="mt-1 font-medium">{formatDate(client.archived_at)}</p></div> : null}
        </div>
      </aside>
    </div>
    {!archived ? <ClientRelationshipWorkspace clientName={client.name} /> : null}
  </>
}
