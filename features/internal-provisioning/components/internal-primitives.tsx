import { ArrowLeft, Plus } from 'lucide-react'
import Link from 'next/link'

export function InternalPageHeader({ title, description, backHref, actions }: { title: string; description: string; backHref?: string; actions?: React.ReactNode }) {
  return <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3">{backHref ? <Link href={backHref} aria-label="Back" className="mt-1 flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Link> : null}<div><p className="text-[0.65rem] font-semibold tracking-[0.12em] text-brand uppercase">HIMARK Internal</p><h1 className="mt-1 text-2xl font-bold tracking-tight lg:text-3xl">{title}</h1><p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p></div></div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</header>
}

export function InternalMetric({ label, value, detail, icon: Icon, tone = 'brand' }: { label: string; value: string; detail: string; icon: typeof Plus; tone?: 'brand' | 'success' | 'warning' | 'danger' }) {
  const classes = tone === 'success' ? 'bg-success-soft text-success' : tone === 'warning' ? 'bg-warning-soft text-warning' : tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'
  return <article className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><div className="flex items-center justify-between"><p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p><span className={`flex size-8 items-center justify-center rounded-lg ${classes}`}><Icon className="size-4" /></span></div><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>
}

export function ProvisioningStatusBadge({ status }: { status: string }) {
  const classes = /live|active|ready|complete/i.test(status) ? 'bg-success-soft text-success' : /fail/i.test(status) ? 'bg-danger-soft text-danger' : /pause|configuration|provisioning|pending/i.test(status) ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground'
  return <span className={`inline-flex rounded-md px-2 py-1 text-[0.68rem] font-semibold ${classes}`}>{status}</span>
}

export function InternalEmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand"><Plus className="size-5" /></span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</div>
}
