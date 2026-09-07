import { ArrowLeft, Plus } from 'lucide-react'
import Link from 'next/link'

export function InternalPageHeader({ title, description, backHref, actions }: { title: string; description: string; backHref?: string; actions?: React.ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3">{backHref ? <Link href={backHref} aria-label="Back" className="mt-0.5 flex size-9 items-center justify-center border border-border bg-card text-muted-foreground hover:border-brand/40 hover:text-foreground"><ArrowLeft className="size-4 stroke-[1.6]" /></Link> : null}<div><p className="text-[0.625rem] font-medium tracking-[0.16em] text-brand uppercase">HIMARK Internal</p><h1 className="mt-2 text-2xl font-medium lg:text-[1.75rem]">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div></div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</header>
}

export function InternalMetric({ label, value, detail, icon: Icon, tone = 'brand' }: { label: string; value: string; detail: string; icon: typeof Plus; tone?: 'brand' | 'success' | 'warning' | 'danger' }) {
  const classes = tone === 'success' ? 'bg-success-soft text-success' : tone === 'warning' ? 'bg-warning-soft text-warning' : tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'
  return <article className="border border-border bg-card p-4"><div className="flex items-center justify-between"><p className="font-brand text-[0.625rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</p><span className={`flex size-7 items-center justify-center ${classes}`}><Icon className="size-3.5 stroke-[1.6]" /></span></div><p className="mt-4 font-brand text-[1.375rem] font-medium tracking-[0.025em]">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>
}

export function ProvisioningStatusBadge({ status }: { status: string }) {
  const classes = /live|active|ready|complete/i.test(status) ? 'bg-success-soft text-success' : /fail/i.test(status) ? 'bg-danger-soft text-danger' : /pause|configuration|provisioning|pending/i.test(status) ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground'
  return <span className={`inline-flex border border-current/10 px-2 py-1 text-[0.65rem] font-medium tracking-[0.02em] ${classes}`}>{status}</span>
}

export function InternalEmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><span className="flex size-10 items-center justify-center border border-brand/15 bg-brand-soft text-brand"><Plus className="size-4 stroke-[1.6]" /></span><h3 className="mt-4 font-brand text-sm font-medium tracking-[0.06em] uppercase">{title}</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</div>
}
