import { AlertTriangle, CheckCircle2, FileCheck2, FolderKanban, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

const phases = ['Initiate', 'Discover', 'Design', 'Build', 'Test', 'Ready', 'Deploy', 'Measure'] as const

const projects = [
  { name: 'Claims Automation', phase: 'Test', health: 'At risk', progress: 68 },
  { name: 'Client Onboarding', phase: 'Design', health: 'Healthy', progress: 44 },
  { name: 'Policy Modernisation', phase: 'Build', health: 'Healthy', progress: 57 },
] as const

export function DeliveryPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgb(15_39_74_/_0.16)]', compact && 'rounded-xl shadow-[0_18px_50px_rgb(15_39_74_/_0.14)]')}>
      <div className="grid min-h-[26rem] grid-cols-[7.25rem_1fr] sm:grid-cols-[8.5rem_1fr]">
        <aside className="bg-[#061b3b] px-3 py-4 text-white">
          <p className="text-[0.58rem] font-bold tracking-[0.24em]">UNISON</p>
          <p className="mt-7 text-[0.45rem] font-semibold tracking-[0.18em] text-slate-400">DELIVERY</p>
          <div className="mt-2 space-y-1 text-[0.55rem] font-medium text-slate-300">
            {['Overview', 'Portfolio', 'Projects', 'Frameworks', 'Approvals', 'Vendors'].map((item, index) => (
              <div key={item} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', index === 0 && 'bg-[#1463df] text-white')}>
                <span className="size-1.5 rounded-full border border-current" />
                {item}
              </div>
            ))}
          </div>
          <p className="mt-6 text-[0.45rem] font-semibold tracking-[0.18em] text-slate-400">OPERATIONS</p>
          <div className="mt-2 space-y-1 text-[0.55rem] font-medium text-slate-300">
            <div className="px-2 py-1.5">Clients</div>
            <div className="px-2 py-1.5">Onboarding</div>
          </div>
        </aside>

        <div className="min-w-0 bg-[#f7f9fc] p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#0a1f3d] sm:text-sm">Project Delivery Overview</p>
              <p className="mt-1 hidden text-[0.5rem] text-slate-500 sm:block">Portfolio health, governance and execution performance.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.5rem] font-semibold text-[#0a1f3d]">HIMARK</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
            <PreviewMetric label="Active projects" value="18" icon={FolderKanban} tone="blue" />
            <PreviewMetric label="At risk" value="6" icon={AlertTriangle} tone="amber" />
            <PreviewMetric label="Approvals" value="12" icon={FileCheck2} tone="green" />
            <PreviewMetric label="Health score" value="78" icon={ShieldCheck} tone="blue" />
          </div>

          <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[0.55rem] font-semibold text-[#0a1f3d]">Delivery framework status</p>
            <div className="mt-3 flex min-w-[27rem] items-start">
              {phases.map((phase, index) => (
                <div key={phase} className="relative flex flex-1 flex-col items-center text-center">
                  {index > 0 ? <span className={cn('absolute top-2 right-1/2 h-px w-full', index <= 4 ? 'bg-emerald-500' : 'bg-slate-200')} /> : null}
                  <span className={cn('relative z-10 flex size-4 items-center justify-center rounded-full border bg-white text-[0.42rem] font-bold', index <= 4 ? 'border-emerald-500 text-emerald-700' : 'border-slate-300 text-slate-500')}>{index + 1}</span>
                  <span className="mt-1 text-[0.42rem] font-medium text-slate-600">{phase}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_0.8fr]">
            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3 py-2 text-[0.55rem] font-semibold text-[#0a1f3d]">Portfolio overview</div>
              <div className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <div key={project.name} className="grid grid-cols-[1fr_2.5rem_3rem] items-center gap-2 px-3 py-2 text-[0.48rem]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0a1f3d]">{project.name}</p>
                      <p className="mt-1 text-slate-500">{project.phase} · {project.progress}%</p>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#1463df]" style={{ width: `${project.progress}%` }} /></div>
                    <span className={cn('rounded px-1 py-0.5 text-center font-semibold', project.health === 'Healthy' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{project.health}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[0.55rem] font-semibold text-[#0a1f3d]">Delivery risks</p>
              <div className="mt-3 space-y-3">
                <PreviewRisk label="Governance gate delayed" tone="danger" />
                <PreviewRisk label="Vendor dependency due" tone="warning" />
                <PreviewRisk label="Approval awaiting owner" tone="info" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewMetric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof CheckCircle2; tone: 'blue' | 'amber' | 'green' }) {
  const iconTone = tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'green' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[0.44rem] font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-base font-bold text-[#0a1f3d]">{value}</p>
        </div>
        <span className={cn('flex size-6 items-center justify-center rounded-full', iconTone)}><Icon className="size-3" /></span>
      </div>
    </article>
  )
}

function PreviewRisk({ label, tone }: { label: string; tone: 'danger' | 'warning' | 'info' }) {
  return (
    <div className="flex items-start gap-2 text-[0.48rem] text-slate-600">
      <span className={cn('mt-0.5 size-1.5 shrink-0 rounded-full', tone === 'danger' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-blue-500')} />
      <span>{label}</span>
    </div>
  )
}
