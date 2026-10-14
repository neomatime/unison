import Link from 'next/link'
import { ArrowRight, FileText, FolderLock, LineChart, Network, Receipt, Target, Users, Workflow } from 'lucide-react'
import type { CSSProperties } from 'react'

import { ClientPreview } from './client-preview'
import { stagger } from './motion'
import { Reveal } from './reveal'

const platformFeatures = [
  { title: 'Clients', description: 'A living profile for every client: contacts, history, files and relationship health, always up to date.', icon: Users },
  { title: 'Leads and pipeline', description: 'Capture every lead, qualify it, and move each opportunity forward with a clear next step.', icon: Target },
  { title: 'Quotes', description: 'Polished, accurate quotations with the right terms built in, ready to send in minutes.', icon: FileText },
  { title: 'Invoices and payments', description: 'Raise invoices from accepted quotes and follow every payment, due date and overdue balance.', icon: Receipt },
  { title: 'Client files', description: 'Briefs, agreements and proof of work, kept private and organised on each client’s record.', icon: FolderLock },
  { title: 'Forecasting', description: 'See the revenue and cash you can expect, month by month, before it arrives.', icon: LineChart },
] as const

const journey = ['Lead', 'Qualified', 'Proposal', 'Quoted', 'Accepted', 'Invoiced', 'Paid', 'Renewed'] as const

const interactionClass = 'transition-colors duration-300 ease-out motion-reduce:transition-none'

export function LandingPage() {
  return (
    <main className="lux-page min-h-screen bg-white text-[#0d2340]">
      {/* Without JavaScript nothing can reveal itself, so show everything. */}
      <noscript>
        <style>{'.lux-reveal,.lux-mask>span,.lux-draw,.lux-draw-y,.lux-preview,.lux-fill,.lux-fade,.lux-step-dot{opacity:1!important;transform:none!important;filter:none!important}'}</style>
      </noscript>

      <header className="sticky top-0 z-30 border-b border-[#dce3eb]/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[100rem] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" className="text-xl font-medium tracking-[0.22em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1769aa] sm:text-2xl">UNISON</Link>
          <nav aria-label="Main navigation" className="lux-nav hidden items-center gap-10 text-sm text-[#334d6d] md:flex">
            <a href="#platform" className={`${interactionClass} hover:text-[#1769aa]`}>Platform</a>
            <a href="#journey" className={`${interactionClass} hover:text-[#1769aa]`}>Client journey</a>
            <a href="#relationships" className={`${interactionClass} hover:text-[#1769aa]`}>Relationships</a>
            <a href="#security" className={`${interactionClass} hover:text-[#1769aa]`}>Security</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className={`hidden px-3 py-2 text-sm font-medium text-[#334d6d] hover:text-[#1769aa] sm:inline-flex ${interactionClass}`}>Sign in</Link>
            <Link href="/sign-in" className="lux-btn inline-flex h-11 items-center gap-3 bg-[#1769aa] px-5 text-sm font-medium text-white hover:bg-[#125486] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d2340]">Access UNISON <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#dce3eb] bg-[#fbfcfe]">
        <div aria-hidden="true" className="lux-drift absolute top-0 right-0 hidden h-full w-[42%] border-l border-[#dce3eb] bg-[#eef3f8] lg:block" />
        <div aria-hidden="true" className="lux-glow pointer-events-none absolute -top-40 left-[8%] size-[38rem] rounded-full bg-[radial-gradient(closest-side,rgb(143_185_236_/_0.28),transparent)]" />
        <div className="relative mx-auto grid max-w-[100rem] gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:px-12 lg:py-24 xl:py-28">
          <Reveal variant="plain" className="max-w-[38rem]">
            <span aria-hidden="true" className="lux-draw block h-px w-14 bg-[#1769aa]" />
            <p className="lux-reveal mt-7 text-[0.6875rem] font-medium tracking-[0.24em] text-[#55749a] uppercase" style={stagger(1, 0, 150)}>The client relationship platform</p>
            <h1 className="mt-8 text-[3.1rem] leading-[0.98] font-medium tracking-[-0.05em] sm:text-[4rem] lg:text-[clamp(3rem,3.9vw,4.9rem)] lg:whitespace-nowrap">
              <span className="lux-mask"><span style={stagger(0, 0, 250)}>Every client.</span></span>
              <span className="lux-mask"><span style={stagger(0, 0, 420)}>One relationship.</span></span>
            </h1>
            <p className="lux-reveal mt-8 max-w-[36rem] text-lg leading-8 text-[#5f7390] sm:text-xl" style={stagger(0, 0, 760)}>UNISON brings your leads, clients, quotes and invoices into one calm workspace, so every conversation, commitment and payment is in view for your whole team.</p>
            <div className="lux-reveal mt-10 flex flex-wrap items-center gap-5" style={stagger(0, 0, 960)}>
              <Link href="/sign-in" className="lux-btn inline-flex h-14 items-center gap-5 bg-[#1769aa] px-7 text-sm font-medium text-white hover:bg-[#125486] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d2340]">Sign in to workspace <ArrowRight className="size-4" /></Link>
              <a href="#platform" className={`lux-link inline-flex h-14 items-center gap-3 px-2 text-sm font-medium text-[#1769aa] hover:text-[#0f4c7d] ${interactionClass}`}>Explore the platform <ArrowRight className="size-4" /></a>
            </div>
          </Reveal>

          <Reveal variant="plain" className="relative py-4 lg:py-10" delay={350}>
            <div aria-hidden="true" className="lux-drift absolute -inset-y-12 left-[12%] w-px">
              <span className="lux-draw-y block size-full bg-[#c9d6e4]" style={stagger(0, 0, 600)} />
            </div>
            <div className="lux-stage">
              <div className="lux-preview" style={{ '--lux-delay': '450ms' } as CSSProperties}>
                <div className="lux-float">
                  <ClientPreview />
                </div>
              </div>
            </div>
            <div aria-hidden="true" className="mx-auto mt-1 h-3 w-[92%] border-x-[18px] border-t-[10px] border-x-transparent border-t-[#b9c2cc]/70" />
            <p className="mt-4 text-center text-[0.6875rem] tracking-[0.12em] text-[#8192aa] uppercase">Illustration · sample clients and figures</p>
          </Reveal>
        </div>
      </section>

      <section className="border-b border-[#dce3eb] bg-white">
        <Reveal variant="plain" className="mx-auto grid max-w-[100rem] md:grid-cols-3">
          <ValuePillar icon={Users} title="One client record." description="Every contact, file and conversation in one place." index={0} />
          <ValuePillar icon={Workflow} title="One pipeline." description="From the first lead to a signed quote." separated index={1} />
          <ValuePillar icon={Network} title="One team." description="Everyone in step with every client." separated index={2} />
        </Reveal>
      </section>

      <section id="platform" className="mx-auto max-w-[100rem] scroll-mt-24 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
          <Reveal className="max-w-lg">
            <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[#55749a] uppercase">Everything for the relationship</p>
            <h2 className="mt-4 text-3xl font-medium tracking-[-0.035em] sm:text-4xl">One platform for every client you look after.</h2>
            <p className="mt-5 text-base leading-7 text-[#657590]">Bring your clients, pipeline, quotations, invoices and files together, so nothing about a relationship lives in someone’s inbox.</p>
          </Reveal>
          <Reveal variant="plain" className="grid border-t border-l border-[#dce3eb] sm:grid-cols-2 xl:grid-cols-3">
            {platformFeatures.map(({ title, description, icon: Icon }, index) => (
              <article key={title} className="lux-card lux-reveal group border-r border-b border-[#dce3eb] p-7" style={stagger(index, 110, 100)}>
                <Icon className="lux-icon size-5 text-[#1769aa]" strokeWidth={1.6} />
                <h3 className="mt-7 text-sm font-medium tracking-[0.08em] uppercase">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#657590]">{description}</p>
              </article>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="journey" className="scroll-mt-24 border-y border-[#dce3eb] bg-[#fafbfd]">
        <div className="mx-auto max-w-[100rem] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[21rem_1fr] lg:items-center">
            <Reveal>
              <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[#55749a] uppercase">The client journey</p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.035em]">From first hello to final payment.</h2>
              <p className="mt-5 text-sm leading-6 text-[#657590]">A clear path for every client, so you always know what has happened and what comes next.</p>
            </Reveal>
            <Reveal variant="plain" className="overflow-x-auto border border-[#dce3eb] bg-white px-5 py-10">
              <div className="flex min-w-[48rem] items-start">
                {journey.map((phase, index) => {
                  const done = index <= 4
                  return (
                    <div key={phase} className="relative flex flex-1 flex-col items-center text-center">
                      {index > 0 ? <span aria-hidden="true" className={`lux-draw absolute top-4 right-1/2 h-px w-full ${done ? 'bg-[#5ca579]' : 'bg-[#dce3eb]'}`} style={stagger(index, 220, 200)} /> : null}
                      <span
                        style={stagger(index, 220, 150)}
                        className={`lux-step-dot relative z-10 flex size-8 items-center justify-center rounded-full border bg-white text-xs font-medium ${done ? 'border-[#5ca579] text-[#34714f]' : 'border-[#c9d4e1] text-[#8192aa]'} ${index === 4 ? 'lux-pulse' : ''}`}
                      >{index + 1}</span>
                      <span className="lux-reveal mt-3 text-[0.6875rem] font-medium tracking-[0.08em] uppercase" style={stagger(index, 220, 300)}>{phase}</span>
                    </div>
                  )
                })}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="relationships" className="mx-auto max-w-[100rem] scroll-mt-24 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
          <Reveal>
            <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[#55749a] uppercase">Relationship confidence</p>
            <h2 className="mt-4 max-w-lg text-3xl font-medium tracking-[-0.035em] sm:text-4xl">Everything you need to look after every client.</h2>
          </Reveal>
          <Reveal variant="plain" className="grid border-t border-[#dce3eb] sm:grid-cols-2">
            <Outcome title="A complete client history" description="Every contact, note, file and document in one place, whoever picks up the conversation." index={0} />
            <Outcome title="Follow-ups that never slip" description="Tasks and reminders tied to the client, so every commitment is kept." index={1} />
            <Outcome title="Clear commercial terms" description="Approved wording on every quote and invoice, consistent across the whole team." index={2} />
            <Outcome title="Cash you can see" description="Know what is invoiced, paid and overdue, and what to expect next." index={3} />
          </Reveal>
        </div>
      </section>

      <section id="security" className="relative scroll-mt-24 overflow-hidden border-t border-[#dce3eb] bg-[#0d2340] px-5 py-16 text-white sm:px-8 lg:px-12">
        <div aria-hidden="true" className="lux-glow pointer-events-none absolute -right-32 -bottom-48 size-[34rem] rounded-full bg-[radial-gradient(closest-side,rgb(23_105_170_/_0.55),transparent)]" />
        <Reveal variant="plain" className="relative mx-auto flex max-w-[92rem] flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="lux-reveal">
            <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[#8fb9ec] uppercase">Your client workspace</p>
            <h2 className="mt-3 text-2xl font-medium tracking-[-0.025em] sm:text-3xl">Continue into UNISON.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#bdcada]">Invitation-only access for authorised organisation members. Every organisation’s clients and files are private and kept separate.</p>
          </div>
          <Link href="/sign-in" className="lux-btn lux-reveal inline-flex h-12 shrink-0 items-center justify-center gap-3 self-start bg-[#1769aa] px-6 text-sm font-medium text-white hover:bg-[#125486] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" style={stagger(0, 0, 200)}>Sign in to workspace <ArrowRight className="size-4" /></Link>
        </Reveal>
      </section>

      <footer className="border-t border-[#dce3eb] bg-white">
        <div className="mx-auto flex max-w-[100rem] flex-col gap-3 px-5 py-7 text-sm text-[#657590] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p className="font-medium tracking-[0.22em] text-[#0d2340]">UNISON</p>
          <p>Client relationship management.</p>
        </div>
      </footer>
    </main>
  )
}

function ValuePillar({ icon: Icon, title, description, separated = false, index }: { icon: typeof Users; title: string; description: string; separated?: boolean; index: number }) {
  return (
    <article className={`lux-reveal flex items-start gap-6 px-8 py-10 lg:px-12 ${separated ? 'border-t border-[#dce3eb] md:border-t-0 md:border-l' : ''}`} style={stagger(index, 140)}>
      <span className="flex size-14 shrink-0 items-center justify-center bg-[#edf3f8] text-[#1769aa]"><Icon className="size-6" strokeWidth={1.6} /></span>
      <div><h2 className="text-xl font-medium tracking-[-0.02em]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#657590]">{description}</p></div>
    </article>
  )
}

function Outcome({ title, description, index }: { title: string; description: string; index: number }) {
  return <article className="lux-reveal border-r border-b border-[#dce3eb] py-7 pr-7 sm:pl-7" style={stagger(index, 120, 80)}><h3 className="text-sm font-medium tracking-[0.04em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[#657590]">{description}</p></article>
}
