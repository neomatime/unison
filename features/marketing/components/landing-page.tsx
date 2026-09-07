import Link from 'next/link'
import { ArrowRight, BadgeCheck, Boxes, FileCheck2, Network, ShieldCheck, Store, Users, Workflow } from 'lucide-react'

import { DeliveryPreview } from './delivery-preview'

const platformFeatures = [
  { title: 'Frameworks', description: 'Turn proven delivery methods into governed, repeatable execution.', icon: Boxes },
  { title: 'Portfolio', description: 'See delivery health, ownership, risk and outcomes in one place.', icon: Network },
  { title: 'Approvals', description: 'Standardise decisions with accountable, traceable approval flows.', icon: FileCheck2 },
  { title: 'Vendors', description: 'Manage third-party exposure, obligations and delivery dependencies.', icon: Store },
] as const

const lifecycle = ['Initiate', 'Discover', 'Design', 'Build', 'Test', 'Ready', 'Deploy', 'Measure'] as const

const interactionClass = 'transition-colors duration-150 ease-out motion-reduce:transition-none'

export function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-[#0d2340]">
      <header className="border-b border-[#dce3eb] bg-white">
        <div className="mx-auto flex h-20 max-w-[100rem] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" className="text-xl font-medium tracking-[0.22em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1769aa] sm:text-2xl">UNISON</Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-9 text-sm text-[#334d6d] md:flex">
            <a href="#platform" className={`${interactionClass} hover:text-[#1769aa]`}>Platform</a>
            <a href="#framework" className={`${interactionClass} hover:text-[#1769aa]`}>Frameworks</a>
            <a href="#governance" className={`${interactionClass} hover:text-[#1769aa]`}>Governance</a>
            <a href="#security" className={`${interactionClass} hover:text-[#1769aa]`}>Security</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className={`hidden px-3 py-2 text-sm font-medium text-[#334d6d] hover:text-[#1769aa] sm:inline-flex ${interactionClass}`}>Sign in</Link>
            <Link href="/sign-in" className={`inline-flex h-11 items-center gap-3 bg-[#1769aa] px-5 text-sm font-medium text-white hover:bg-[#125486] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d2340] ${interactionClass}`}>Access UNISON <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#dce3eb] bg-[#fbfcfe]">
        <div aria-hidden="true" className="absolute top-0 right-0 hidden h-full w-[42%] border-l border-[#dce3eb] bg-[#eef3f8] lg:block" />
        <div className="relative mx-auto grid max-w-[100rem] gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:px-12 lg:py-24 xl:py-28">
          <div className="max-w-[38rem]">
            <p className="text-[0.6875rem] font-medium tracking-[0.2em] text-[#55749a] uppercase">The operating layer for governed enterprise delivery</p>
            <h1 className="mt-8 text-[3.4rem] leading-[0.98] font-medium tracking-[-0.05em] sm:text-[4.6rem] lg:text-[clamp(3.6rem,5vw,5.5rem)]">Aligned delivery.<br />Greater impact.</h1>
            <p className="mt-8 max-w-[36rem] text-lg leading-8 text-[#5f7390] sm:text-xl">UNISON turns fragmented delivery methods into one live operating environment for visibility, governance, intervention, and alignment.</p>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Link href="/sign-in" className={`inline-flex h-14 items-center gap-5 bg-[#1769aa] px-7 text-sm font-medium text-white hover:bg-[#125486] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d2340] ${interactionClass}`}>Sign in to workspace <ArrowRight className="size-4" /></Link>
              <a href="#platform" className={`inline-flex h-14 items-center gap-3 px-2 text-sm font-medium text-[#1769aa] hover:text-[#0f4c7d] ${interactionClass}`}>Explore the platform <ArrowRight className="size-4" /></a>
            </div>
          </div>

          <div className="relative py-4 lg:py-10">
            <div aria-hidden="true" className="absolute -inset-y-12 left-[12%] w-px bg-[#c9d6e4]" />
            <DeliveryPreview />
            <div aria-hidden="true" className="mx-auto h-3 w-[92%] border-x-[18px] border-t-[10px] border-x-transparent border-t-[#b9c2cc]" />
          </div>
        </div>
      </section>

      <section id="security" className="border-b border-[#dce3eb] bg-white">
        <div className="mx-auto grid max-w-[100rem] md:grid-cols-3">
          <ValuePillar icon={Network} title="One picture." description="Live visibility across all delivery work." />
          <ValuePillar icon={Workflow} title="One model." description="Built-in governance and intervention." separated />
          <ValuePillar icon={Users} title="One organisation." description="Greater alignment. Stronger outcomes." separated />
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-[100rem] scroll-mt-6 px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="max-w-lg">
            <p className="text-[0.6875rem] font-medium tracking-[0.2em] text-[#55749a] uppercase">Connected governance</p>
            <h2 className="mt-4 text-3xl font-medium tracking-[-0.035em] sm:text-4xl">One platform for governed delivery.</h2>
            <p className="mt-5 text-base leading-7 text-[#657590]">Bring projects, methods, approvals and external dependencies into one controlled operating environment.</p>
          </div>
          <div className="grid border-t border-l border-[#dce3eb] sm:grid-cols-2">
            {platformFeatures.map(({ title, description, icon: Icon }) => (
              <article key={title} className="group border-r border-b border-[#dce3eb] p-7 transition-colors duration-150 hover:bg-[#fafbfd] motion-reduce:transition-none">
                <Icon className="size-5 text-[#1769aa]" strokeWidth={1.6} />
                <h3 className="mt-7 text-sm font-medium tracking-[0.08em] uppercase">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#657590]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="framework" className="scroll-mt-6 border-y border-[#dce3eb] bg-[#fafbfd]">
        <div className="mx-auto max-w-[100rem] px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[21rem_1fr] lg:items-center">
            <div>
              <p className="text-[0.6875rem] font-medium tracking-[0.2em] text-[#55749a] uppercase">The UNISON framework</p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.035em]">A controlled path from intent to outcome.</h2>
              <p className="mt-5 text-sm leading-6 text-[#657590]">Standardise execution without forcing every project into the same shape.</p>
            </div>
            <div className="overflow-x-auto border border-[#dce3eb] bg-white px-5 py-9">
              <div className="flex min-w-[45rem] items-start">
                {lifecycle.map((phase, index) => (
                  <div key={phase} className="relative flex flex-1 flex-col items-center text-center">
                    {index > 0 ? <span className={index <= 4 ? 'absolute top-4 right-1/2 h-px w-full bg-[#5ca579]' : 'absolute top-4 right-1/2 h-px w-full bg-[#dce3eb]'} /> : null}
                    <span className={index <= 4 ? 'relative z-10 flex size-8 items-center justify-center rounded-full border border-[#5ca579] bg-white text-xs font-medium text-[#34714f]' : 'relative z-10 flex size-8 items-center justify-center rounded-full border border-[#bdc9d6] bg-white text-xs font-medium text-[#657590]'}>{index + 1}</span>
                    <span className="mt-3 text-[0.6875rem] font-medium tracking-[0.08em] uppercase">{phase}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="governance" className="mx-auto max-w-[100rem] scroll-mt-6 px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="text-[0.6875rem] font-medium tracking-[0.2em] text-[#55749a] uppercase">Delivery confidence</p>
            <h2 className="mt-4 max-w-lg text-3xl font-medium tracking-[-0.035em] sm:text-4xl">Everything needed to deliver with control.</h2>
          </div>
          <div className="grid border-t border-[#dce3eb] sm:grid-cols-2">
            <Outcome title="Governance gates" description="Put evidence, ownership and quality checks at every critical transition." />
            <Outcome title="Delivery lineage" description="Maintain a reliable trail from business intent through delivery and benefits." />
            <Outcome title="Risk visibility" description="Surface blockers, dependencies and exceptions before they become surprises." />
            <Outcome title="Benefits realisation" description="Track outcomes, value and accountability beyond the go-live date." />
          </div>
        </div>
      </section>

      <section className="border-t border-[#dce3eb] bg-[#0d2340] px-5 py-12 text-white sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[92rem] flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[0.6875rem] font-medium tracking-[0.2em] text-[#8fb9ec] uppercase">Your governed workspace</p>
            <h2 className="mt-3 text-2xl font-medium tracking-[-0.025em] sm:text-3xl">Continue into UNISON.</h2>
            <p className="mt-3 text-sm text-[#bdcada]">Invitation-only access for authorised organization members.</p>
          </div>
          <Link href="/sign-in" className={`inline-flex h-12 shrink-0 items-center justify-center gap-3 self-start bg-[#1769aa] px-6 text-sm font-medium text-white hover:bg-[#125486] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:self-auto ${interactionClass}`}>Sign in <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-[#dce3eb] bg-white">
        <div className="mx-auto flex max-w-[100rem] flex-col gap-3 px-5 py-7 text-sm text-[#657590] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p className="font-medium tracking-[0.22em] text-[#0d2340]">UNISON</p>
          <p>Governed enterprise project delivery.</p>
        </div>
      </footer>
    </main>
  )
}

function ValuePillar({ icon: Icon, title, description, separated = false }: { icon: typeof ShieldCheck; title: string; description: string; separated?: boolean }) {
  return (
    <article className={`flex items-start gap-6 px-8 py-10 lg:px-12 ${separated ? 'border-t border-[#dce3eb] md:border-t-0 md:border-l' : ''}`}>
      <span className="flex size-14 shrink-0 items-center justify-center bg-[#edf3f8] text-[#1769aa]"><Icon className="size-6" strokeWidth={1.6} /></span>
      <div><h2 className="text-xl font-medium tracking-[-0.02em]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#657590]">{description}</p></div>
    </article>
  )
}

function Outcome({ title, description }: { title: string; description: string }) {
  return <article className="border-r border-b border-[#dce3eb] py-7 pr-7 sm:pl-7"><h3 className="text-sm font-medium tracking-[0.04em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[#657590]">{description}</p></article>
}
