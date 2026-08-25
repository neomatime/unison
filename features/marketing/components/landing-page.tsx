import Link from 'next/link'
import { ArrowRight, BadgeCheck, Boxes, FileCheck2, Network, ShieldCheck, Store, Workflow } from 'lucide-react'

import { DeliveryPreview } from './delivery-preview'

const platformFeatures = [
  { title: 'Frameworks', description: 'Turn proven delivery methods into governed, repeatable execution.', icon: Boxes },
  { title: 'Portfolio', description: 'See delivery health, ownership, risk and outcomes in one place.', icon: Network },
  { title: 'Approvals', description: 'Standardise decisions with accountable, traceable approval flows.', icon: FileCheck2 },
  { title: 'Vendors', description: 'Manage third-party exposure, obligations and delivery dependencies.', icon: Store },
] as const

const lifecycle = ['Initiate', 'Discover', 'Design', 'Build', 'Test', 'Ready', 'Deploy', 'Measure'] as const

export function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-[#071c3a]">
      <header className="border-b border-white/10 bg-[#061b3b] text-white">
        <div className="mx-auto flex h-[4.5rem] max-w-[92rem] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" className="text-lg font-bold tracking-[0.24em] sm:text-xl">UNISON</Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            <a href="#platform" className="transition-colors hover:text-white">Platform</a>
            <a href="#framework" className="transition-colors hover:text-white">Framework</a>
            <a href="#governance" className="transition-colors hover:text-white">Governance</a>
            <a href="#security" className="transition-colors hover:text-white">Security</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="hidden px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:text-white sm:inline-flex">Sign in</Link>
            <Link href="/sign-in" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1463df] px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgb(20_99_223_/_0.28)] transition-colors hover:bg-[#0d56c9]">Access UNISON <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_18%_12%,rgba(20,99,223,0.08),transparent_31%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]">
        <div aria-hidden="true" className="absolute -top-40 right-[-10rem] size-[34rem] rounded-full border border-blue-100/70" />
        <div className="relative mx-auto grid max-w-[92rem] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.84fr_1.16fr] lg:items-center lg:px-12 lg:py-24">
          <div className="max-w-xl">
            <p className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#1463df]">The enterprise project delivery system</p>
            <h1 className="mt-6 text-4xl leading-[1.05] font-bold tracking-[-0.045em] sm:text-5xl lg:text-[4rem]">Governed project delivery for <span className="text-[#1463df]">enterprise teams.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">UNISON turns fragmented project methods into an executable delivery system—so teams move with clear ownership, controlled governance and complete visibility.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-in" className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#1463df] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgb(20_99_223_/_0.24)] transition-colors hover:bg-[#0d56c9]">Sign in to workspace <ArrowRight className="size-4" /></Link>
              <a href="#platform" className="inline-flex h-12 items-center gap-2 rounded-lg border border-blue-200 bg-white px-5 text-sm font-semibold text-[#0a3f93] transition-colors hover:bg-blue-50">Explore the platform <Workflow className="size-4" /></a>
            </div>
            <div id="security" className="mt-10 grid max-w-lg gap-4 border-t border-slate-200 pt-6 text-sm text-slate-600 sm:grid-cols-3">
              <TrustSignal icon={ShieldCheck} label="Enterprise security" />
              <TrustSignal icon={Workflow} label="Governed delivery" />
              <TrustSignal icon={BadgeCheck} label="Audit-ready control" />
            </div>
          </div>
          <DeliveryPreview />
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[92rem] grid-cols-2 gap-6 px-5 py-8 sm:px-8 md:grid-cols-4 lg:px-12">
          <Stat value="One" label="connected delivery system" />
          <Stat value="8" label="governed lifecycle stages" />
          <Stat value="360°" label="portfolio visibility" />
          <Stat value="100%" label="decision traceability" />
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-[92rem] scroll-mt-6 px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[0.14em] text-[#1463df] uppercase">Connected governance</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">One platform for governed delivery</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">Bring projects, methods, approvals and external dependencies into one calm operating environment.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {platformFeatures.map(({ title, description, icon: Icon }) => (
            <article key={title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgb(15_39_74_/_0.04)]">
              <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-[#1463df]"><Icon className="size-5" /></span>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="framework" className="scroll-mt-6 border-y border-slate-200 bg-[#f7f9fc]">
        <div className="mx-auto max-w-[92rem] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[20rem_1fr] lg:items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-[#1463df] uppercase">The UNISON framework</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">A controlled path from intent to outcome.</h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">Standardise execution without forcing every project into the same shape.</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-5 py-8 shadow-[0_1px_2px_rgb(15_39_74_/_0.04)]">
              <div className="flex min-w-[45rem] items-start">
                {lifecycle.map((phase, index) => (
                  <div key={phase} className="relative flex flex-1 flex-col items-center text-center">
                    {index > 0 ? <span className={index <= 4 ? 'absolute top-4 right-1/2 h-px w-full bg-emerald-500' : 'absolute top-4 right-1/2 h-px w-full bg-slate-200'} /> : null}
                    <span className={index <= 4 ? 'relative z-10 flex size-8 items-center justify-center rounded-full border border-emerald-500 bg-white text-xs font-bold text-emerald-700' : 'relative z-10 flex size-8 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-500'}>{index + 1}</span>
                    <span className="mt-3 text-xs font-semibold">{phase}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="governance" className="mx-auto max-w-[92rem] scroll-mt-6 px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-[#1463df] uppercase">Delivery confidence</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Everything needed to deliver with control.</h2>
          </div>
          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            <Outcome title="Governance gates" description="Put evidence, ownership and quality checks at every critical transition." />
            <Outcome title="Delivery lineage" description="Maintain a reliable trail from business intent through delivery and benefits." />
            <Outcome title="Risk visibility" description="Surface blockers, dependencies and exceptions before they become surprises." />
            <Outcome title="Benefits realisation" description="Track outcomes, value and accountability beyond the go-live date." />
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8 lg:px-12 lg:pb-20">
        <div className="mx-auto flex max-w-[84rem] flex-col gap-6 overflow-hidden rounded-2xl bg-[#061b3b] px-7 py-9 text-white shadow-[0_22px_60px_rgb(6_27_59_/_0.18)] sm:px-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-blue-300 uppercase">Your governed workspace</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Continue into UNISON.</h2>
            <p className="mt-2 text-sm text-slate-300">Invitation-only access for authorised organization members.</p>
          </div>
          <Link href="/sign-in" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-[#1463df] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#2774e5] lg:self-auto">Sign in <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#f7f9fc]">
        <div className="mx-auto flex max-w-[92rem] flex-col gap-3 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p className="font-bold tracking-[0.2em] text-[#071c3a]">UNISON</p>
          <p>Governed enterprise project delivery.</p>
        </div>
      </footer>
    </main>
  )
}

function TrustSignal({ icon: Icon, label }: { icon: typeof ShieldCheck; label: string }) {
  return <div className="flex items-center gap-2"><Icon className="size-4 text-[#1463df]" /><span>{label}</span></div>
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div><p className="text-xl font-bold text-[#071c3a] sm:text-2xl">{value}</p><p className="mt-1 text-xs text-slate-500 sm:text-sm">{label}</p></div>
}

function Outcome({ title, description }: { title: string; description: string }) {
  return <article className="border-t border-slate-200 pt-5"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></article>
}
