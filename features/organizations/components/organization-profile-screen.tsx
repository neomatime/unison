import {
  Building2,
  Check,
  ExternalLink,
  FolderKanban,
  Globe2,
  Link2,
  Mail,
  Palette,
  Pencil,
  ReceiptText,
  Settings2,
  Users,
} from 'lucide-react'
import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { ContentPanel } from '@/components/ui/content-panel'
import { InitialAvatar } from '@/components/ui/initial-avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import type { OrganizationProfileData } from '@/features/organizations/types'
import { cn, getInitials } from '@/lib/utils'
import { OrganizationMenu } from './organization-menu'

type OrganizationProfileScreenProps = {
  profile: OrganizationProfileData
  saved?: boolean
}

const unavailableTabs = ['Settings', 'Subscription & Billing', 'Integrations', 'Audit Log'] as const

export function OrganizationProfileScreen({ profile, saved = false }: OrganizationProfileScreenProps) {
  const headerActions = (
    <>
      {profile.canEdit ? (
        <Link
          href="/settings/edit"
          className="inline-flex h-10 items-center gap-2 border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-muted-foreground/45 hover:bg-muted/40 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Pencil className="size-4" />
          Edit organisation
        </Link>
      ) : null}
      <OrganizationMenu organizationId={profile.id} />
    </>
  )

  return (
    <>
      <WorkspaceHeader
        category="Settings"
        title="Organisation Profile"
        description="Manage your organisation’s details, settings and preferences."
        actions={headerActions}
      />

      {saved ? (
        <div role="status" className="mb-4 flex items-center gap-2 border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">
          <Check className="size-4 shrink-0" />
          Organisation details updated.
        </div>
      ) : null}

      <OrganisationProfileHeader profile={profile} />
      <OrganisationTabs />
      <OrganisationSummaryMetrics profile={profile} />

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <OrganisationDetailsPanel profile={profile} className="xl:col-span-5 xl:row-span-2" />
        <div className="grid content-start gap-4 xl:col-span-4">
          <OrganisationBrandingPanel organizationName={profile.name} />
          <OrganisationContactPanel owner={profile.workspaceOwner} />
        </div>
        <div className="grid content-start gap-4 xl:col-span-3">
          <OrganisationSubscriptionPanel profile={profile} />
          <OrganisationIntegrationsPanel />
          <OrganisationSettingsLink />
        </div>
      </div>
    </>
  )
}

export function OrganisationProfileHeader({ profile }: { profile: OrganizationProfileData }) {
  return (
    <section aria-labelledby="organisation-identity-heading" className="border border-border bg-card px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <InitialAvatar initials={getInitials(profile.name)} className="size-20 text-xl tracking-[0.08em] sm:size-24 sm:text-2xl" />
          <div className="min-w-0">
            <h2 id="organisation-identity-heading" className="unison-record-name truncate text-2xl text-foreground sm:text-[1.75rem]">
              {profile.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">UNISON organisation workspace</p>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <IdentityFact icon={Building2} label="Workspace slug" value={profile.slug} />
              <IdentityFact icon={Globe2} label="Directory domain" value={profile.emailDomain ?? 'Not configured'} />
            </dl>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-2 border-t border-border pt-5 lg:min-w-72 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <div className="border-r border-border pr-5">
            <dt className="unison-metric-label text-[0.65rem] text-muted-foreground">Workspace created</dt>
            <dd className="mt-2 text-sm font-medium text-foreground">{formatMonthYear(profile.createdAt)}</dd>
          </div>
          <div className="pl-5">
            <dt className="unison-metric-label text-[0.65rem] text-muted-foreground">Status</dt>
            <dd className="mt-2"><OrganizationStatus status={profile.status} /></dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function IdentityFact({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <dt className="sr-only">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

function OrganisationTabs() {
  return (
    <nav aria-label="Organisation profile sections" className="mt-1 overflow-x-auto border-b border-border">
      <div className="flex min-w-max items-end gap-1">
        <Link href="/settings" aria-current="page" className="border-b-2 border-foreground px-4 py-3 text-sm font-medium text-foreground">
          Overview
        </Link>
        {unavailableTabs.slice(0, 3).map((tab) => <UnavailableTab key={tab} label={tab} />)}
        <Link href="/people/team" className="border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          Users
        </Link>
        <Link href="/people/team" className="border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          Teams
        </Link>
        <UnavailableTab label="Audit Log" />
      </div>
    </nav>
  )
}

function UnavailableTab({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={`${label} is not available yet`}
      className="cursor-not-allowed border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground/55"
    >
      {label}
    </button>
  )
}

export function OrganisationSummaryMetrics({ profile }: { profile: OrganizationProfileData }) {
  const metrics = [
    { label: 'Users', value: formatCount(profile.metrics.users), detail: 'Active organisation members', icon: Users },
    { label: 'Projects', value: formatCount(profile.metrics.projects), detail: 'Active projects', icon: FolderKanban },
    { label: 'Clients', value: formatCount(profile.metrics.clients), detail: 'Active clients', icon: Building2 },
    { label: 'Vendors', value: '—', detail: 'Vendor register not connected', icon: ReceiptText },
  ] as const

  return (
    <section aria-label="Organisation summary" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, detail, icon: Icon }) => (
        <article key={label} className="border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="unison-metric-label text-[0.675rem] text-muted-foreground">{label}</p>
              <p className="mt-3 font-brand text-2xl font-medium tabular-nums text-foreground">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
            <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
          </div>
        </article>
      ))}
    </section>
  )
}

export function OrganisationDetailsPanel({ profile, className }: { profile: OrganizationProfileData; className?: string }) {
  const details = [
    ['Organisation name', profile.name],
    ['Workspace slug', profile.slug],
    ['Status', titleCase(profile.status)],
    ['UNISON tier', profile.tierLabel],
    ['Workspace created', formatDate(profile.createdAt)],
    ['Last updated', formatDate(profile.updatedAt)],
    ['Directory domain', profile.emailDomain ?? 'Not configured'],
  ] as const

  return (
    <ContentPanel
      title="Organisation Details"
      className={className}
      action={profile.canEdit ? <Link href="/settings/edit" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand/80"><Pencil className="size-3.5" />Edit</Link> : null}
      bodyClassName="pt-1"
    >
      <dl className="divide-y divide-border">
        {details.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 text-sm sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </ContentPanel>
  )
}

export function OrganisationBrandingPanel({ organizationName }: { organizationName: string }) {
  return (
    <ContentPanel title="Branding" bodyClassName="pt-1">
      <div className="flex items-center gap-3 border-b border-border py-3">
        <InitialAvatar initials={getInitials(organizationName)} className="size-10" />
        <div>
          <p className="text-sm font-medium text-foreground">Generated monogram</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Derived from the organisation name</p>
        </div>
      </div>
      <EmptyPanelMessage icon={Palette} title="No custom branding configured" description="UNISON’s default workspace identity is in use." />
    </ContentPanel>
  )
}

export function OrganisationContactPanel({ owner }: { owner: OrganizationProfileData['workspaceOwner'] }) {
  return (
    <ContentPanel title="Contact Information" bodyClassName="pt-1">
      {owner ? (
        <dl className="divide-y divide-border">
          <DetailRow label="Workspace owner" value={owner.displayName} />
          <DetailRow label="Account email" value={owner.email ?? 'Not configured'} href={owner.email ? `mailto:${owner.email}` : undefined} />
          <div className="py-3 text-xs leading-5 text-muted-foreground">No primary organisation contact is configured in the current data model.</div>
        </dl>
      ) : (
        <EmptyPanelMessage icon={Mail} title="No contact configured" description="A designated organisation contact is not available in the current data model." />
      )}
    </ContentPanel>
  )
}

export function OrganisationSubscriptionPanel({ profile }: { profile: OrganizationProfileData }) {
  return (
    <ContentPanel title="Subscription" bodyClassName="pt-1">
      <dl className="divide-y divide-border">
        <DetailRow label="Tier" value={profile.tierLabel} />
        <div className="grid grid-cols-[6rem_1fr] gap-3 py-3 text-sm">
          <dt className="text-muted-foreground">Organisation status</dt>
          <dd><OrganizationStatus status={profile.status} /></dd>
        </div>
      </dl>
      <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">{profile.tierDescription}</p>
    </ContentPanel>
  )
}

export function OrganisationIntegrationsPanel() {
  return (
    <ContentPanel title="Integrations" bodyClassName="pt-1">
      <EmptyPanelMessage icon={Link2} title="No integrations connected" description="Connected services will appear here when integration support is available." />
    </ContentPanel>
  )
}

export function OrganisationSettingsLink() {
  return (
    <section aria-labelledby="organisation-settings-heading" className="border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Settings2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <h2 id="organisation-settings-heading" className="unison-section-title text-xs text-foreground">Organisation Settings</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Additional defaults, permissions and policies are not available in this release.</p>
        </div>
      </div>
    </section>
  )
}

function OrganizationStatus({ status }: { status: OrganizationProfileData['status'] }) {
  const active = status === 'active'
  const tone = status === 'suspended' ? 'warning' : status === 'archived' ? 'neutral' : 'brand'
  return (
    <StatusBadge tone={tone} className={cn(active && 'bg-success-soft text-success')}>
      <span aria-hidden="true" className={cn('mr-1.5 size-1.5 rounded-full', active ? 'bg-success' : status === 'suspended' ? 'bg-warning' : 'bg-muted-foreground')} />
      {titleCase(status)}
    </StatusBadge>
  )
}

function DetailRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">
        {href ? <a href={href} className="inline-flex items-center gap-1 text-brand hover:underline">{value}<ExternalLink className="size-3" /></a> : value}
      </dd>
    </div>
  )
}

function EmptyPanelMessage({ icon: Icon, title, description }: { icon: typeof Palette; title: string; description: string }) {
  return (
    <div className="py-4">
      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-ZA').format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

function formatMonthYear(value: string) {
  return new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
