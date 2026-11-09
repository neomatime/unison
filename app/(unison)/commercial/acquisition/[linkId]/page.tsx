import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download, ExternalLink, QrCode } from 'lucide-react'

import { WorkPage } from '@/components/shared/work-page'
import { ACQUISITION_CHANNELS } from '@/features/prospect-engagement/catalog'
import { getAcquisitionLink } from '@/features/prospect-engagement/admin-data'
import { publicEngagementUrl } from '@/features/prospect-engagement/asset-data'
import { CopyLinkButton } from '@/features/prospect-engagement/components/copy-link-button'
import { setAcquisitionLinkActiveAction } from '@/features/prospect-engagement/actions'
import { isUuid } from '@/lib/utils'

export default async function Page({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params
  if (!isUuid(linkId)) notFound()
  const data = await getAcquisitionLink(linkId)
  if (!data.link) notFound()
  const link = data.link
  const publicUrl = publicEngagementUrl(link.token)
  const url = new URL(publicUrl)
  const printReady = url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)
  const toggle = setAcquisitionLinkActiveAction.bind(null, link.id, !link.active)
  return <WorkPage category="Commercial" title={link.name} description="Attributable public URL, genuine QR code and print-ready HIMARK engagement assets." parent={{ label: 'Acquisition', href: '/commercial/acquisition' }}>
    {!printReady ? <div className="mb-5 border border-warning/30 bg-warning-soft/35 px-5 py-4 text-sm text-warning"><strong>Preview only.</strong> The configured app URL is local. Set <code>NEXT_PUBLIC_APP_URL</code> to the verified HTTPS deployment before treating the card artwork as print-ready.</div> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="space-y-5">
        <section className="border border-border bg-card p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs tracking-[0.14em] text-brand uppercase">Engagement source</p><h2 className="mt-2 text-xl font-semibold">{link.name}</h2><p className="mt-2 text-sm text-muted-foreground">{ACQUISITION_CHANNELS.find(([id]) => id === link.channel)?.[1] ?? link.channel}</p></div><span className={`px-3 py-1 text-xs font-semibold uppercase ${link.active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{link.active ? 'Active' : 'Disabled'}</span></div><dl className="mt-6 grid gap-4 sm:grid-cols-2"><Fact label="Campaign" value={link.campaignName} /><Fact label="Event" value={link.eventName} /><Fact label="Assigned to" value={link.assignedToName ?? 'Automatic assignment'} /><Fact label="Referring employee" value={link.referringEmployeeName} /><Fact label="Visits" value={String(link.visits)} /><Fact label="Completed enquiries" value={String(link.submissions)} /></dl>{data.canManage ? <form action={toggle} className="mt-6 border-t border-border pt-5"><button className={`px-4 py-2 text-sm font-semibold ${link.active ? 'border border-destructive/40 text-destructive' : 'bg-brand text-white'}`}>{link.active ? 'Disable engagement link' : 'Re-enable engagement link'}</button></form> : null}</section>
        <section className="border border-border bg-card p-6"><h2 className="font-semibold">Public destination</h2><div className="mt-4 break-all border border-border bg-muted/25 p-4 font-mono text-xs">{publicUrl}</div><div className="mt-4 flex flex-wrap gap-2"><CopyLinkButton value={publicUrl} /><Link href={publicUrl} target="_blank" className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm font-medium"><ExternalLink className="size-4" />Open form</Link></div></section>
        <section className="border border-border bg-card p-6"><h2 className="font-semibold">Printable HIMARK engagement card</h2><p className="mt-2 text-sm text-muted-foreground">Two-sided 90 × 50 mm artwork with 3 mm bleed and a minimum 4 mm safe margin. The PDF contains separate front and back pages.</p><img src={`/api/acquisition/links/${link.id}/card?format=png`} alt={`Front and back preview for ${link.name}`} className="mt-5 w-full border border-border bg-muted" /><div className="mt-4 flex flex-wrap gap-2"><Asset href={`/api/acquisition/links/${link.id}/card?format=pdf&download=1`} label="Card PDF" /><Asset href={`/api/acquisition/links/${link.id}/card?format=svg&download=1`} label="Editable SVG" /><Asset href={`/api/acquisition/links/${link.id}/card?format=png&download=1`} label="PNG preview" /></div></section>
      </div>
      <aside className="h-fit border border-border bg-card p-6"><div className="flex items-center gap-2"><QrCode className="size-5 text-brand" /><h2 className="font-semibold">QR code</h2></div><div className="mt-5 bg-white p-5"><img src={`/api/acquisition/links/${link.id}/qr?format=svg`} alt={`QR code for ${link.name}`} className="aspect-square w-full" /></div><p className="mt-4 text-xs leading-5 text-muted-foreground">Standard QR encoding, medium error correction, high contrast and a four-module quiet zone.</p><div className="mt-5 grid gap-2"><Asset href={`/api/acquisition/links/${link.id}/qr?format=svg&download=1`} label="Download QR SVG" /><Asset href={`/api/acquisition/links/${link.id}/qr?format=png&download=1`} label="Download high-resolution PNG" /></div></aside>
    </div>
  </WorkPage>
}

function Fact({ label, value }: { label: string; value: string | null }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value || '—'}</dd></div> }
function Asset({ href, label }: { href: string; label: string }) { return <a href={href} className="inline-flex items-center justify-center gap-2 border border-border px-3 py-2 text-sm font-medium"><Download className="size-4" />{label}</a> }

