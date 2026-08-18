import Link from 'next/link'
import { Archive, AlertTriangle, ArrowLeft, Pencil } from 'lucide-react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { archiveClientAction } from '../actions/archive-client'
import type { ClientRecord } from '../queries/get-client'

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusTone(status: string): 'brand' | 'warning' | 'info' | 'neutral' {
  if (status === 'Active') return 'brand'
  if (status === 'Archived') return 'neutral'
  return 'info'
}

// A Server Component, deliberately: the archive confirmation below is a
// two-step, plain-HTML flow (a link to `?confirm=archive`, then a form
// posted from that page) rather than a client-side confirm() dialog, so it
// works identically with or without JS/hydration having completed.
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
            {/*
              A plain link to a confirmation step, not a client-side
              confirm()/dialog gate — this way the "are you sure" prompt
              is guaranteed to show up even if JS never loads or hasn't
              hydrated yet, closing the "archive with no confirmation"
              gap a client-only dialog would leave open.
            */}
            <Link href={`${detailHref}?confirm=archive`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-destructive"><Archive className="size-4" />Archive Client</Link>
          </div>
        ) : null}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Status" value={client.status} />
        <Summary label="Client health" value={client.health} />
        {/* No projects table yet — an em dash, not a fabricated 0. */}
        <Summary label="Active projects" value="—" />
        <Summary label="Last activity" value={formatDate(client.updated_at)} />
      </div>
      {!archived && confirmArchive ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">Archive {client.name}?</p>
          <p className="mt-1 text-sm text-muted-foreground">This removes it from the active clients list. There is no undo through the UI.</p>
          <div className="mt-4 flex gap-2">
            <Link href={detailHref} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</Link>
            <form action={archiveClientAction.bind(null, client.id)}>
              <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white"><Archive className="size-4" />Yes, archive client</button>
            </form>
          </div>
        </div>
      ) : null}
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-3">
      <section className="rounded-xl border border-border bg-card p-6 xl:col-span-2">
        <h3 className="font-semibold">Company</h3>
        <p className="mt-1 text-sm text-muted-foreground">Core details on record for {client.name}.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Detail label="Industry" value={client.industry} />
          <Detail label="Website" value={client.website} />
          <Detail label="Primary contact" value={client.contact_name} />
          <Detail label="Contact email" value={client.contact_email} />
          <Detail label="Contact phone" value={client.contact_phone} />
          <Detail label="Primary engagement" value={client.service} />
          <Detail label="Billing email" value={client.billing_email} />
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
  </>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <div className="rounded-lg bg-muted/50 p-4"><p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p><p className="mt-1 text-sm font-medium">{value ?? '—'}</p></div>
}
