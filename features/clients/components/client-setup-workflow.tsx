'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudUpload,
  FileClock,
  Info,
  Plus,
  Save,
  Trash2,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { cn } from '@/lib/utils'

const steps = ['Company', 'Contacts', 'Engagement', 'Services', 'Internal Team', 'Onboarding', 'Review'] as const

const plans = [
  { name: 'Signature Partner', price: 'R185,000 / month', description: 'Embedded strategic partnership and executive systems.' },
  { name: 'Growth Partner', price: 'R120,000 / month', description: 'Advanced systems and growth infrastructure.' },
  { name: 'Private Partner', price: 'R75,000 / month', description: 'Focused advisory and operational enablement.' },
  { name: 'Custom', price: 'Tailored commercial model', description: 'A bespoke scope, team and delivery structure.' },
]

const serviceCatalogue = [
  ['UNISON', 'Business operating system workspace', 'Core'],
  ['Delivery Governance', 'Frameworks, approvals and delivery controls', 'Advanced'],
  ['LeadSense', 'Lead qualification and commercial intelligence', 'Advanced'],
  ['CRM / Client OS', 'Client relationships and lifecycle management', 'Advanced'],
  ['Automation', 'Workflow and operational automation', 'Standard'],
  ['Analytics & BI', 'Executive reporting and decision support', 'Advanced'],
  ['Brand Strategy', 'Positioning, narrative and portfolio strategy', 'Standard'],
  ['Brand Identity', 'Identity systems and brand governance', 'Standard'],
  ['Digital Experience', 'Web and product experience design', 'Standard'],
  ['Marketing Systems', 'Campaign, content and channel systems', 'Advanced'],
  ['Growth Consulting', 'Commercial growth advisory', 'Standard'],
  ['Visual Operations', 'Visual management and communication systems', 'Standard'],
] as const

const people = ['Neo Morake', 'Sarah Johnson', 'James Carter', 'Amara Dlamini', 'Lethabo Nkosi', 'Zanele Khumalo']

type ClientData = {
  companyName: string
  legalEntity: string
  tradingName: string
  industry: string
  registration: string
  website: string
  companySize: string
  location: string
  country: string
  timezone: string
  firstName: string
  lastName: string
  jobTitle: string
  department: string
  email: string
  phone: string
  engagementType: string
  contractStart: string
  contractEnd: string
  retainerStart: string
  billingCycle: string
  foundationFee: string
  monthlyRetainer: string
  currency: string
  contractTerm: string
  salesOwner: string
  accountOwner: string
  onboardingStart: string
  goLive: string
  priority: string
}

const initialData: ClientData = {
  companyName: 'LGNDRY.CO',
  legalEntity: 'LGNDRY Group (Pty) Ltd',
  tradingName: 'LGNDRY.CO',
  industry: 'Brand & Digital',
  registration: '2024/123456/07',
  website: 'https://lgndry.co',
  companySize: '11–50',
  location: 'Johannesburg',
  country: 'South Africa',
  timezone: 'Africa/Johannesburg',
  firstName: 'Sarah',
  lastName: 'Mokoena',
  jobTitle: 'Marketing Director',
  department: 'Marketing',
  email: 'sarah@lgndry.co',
  phone: '+27 82 555 0142',
  engagementType: 'Strategic partnership',
  contractStart: '2026-09-01',
  contractEnd: '2027-08-31',
  retainerStart: '2026-09-01',
  billingCycle: 'Monthly in advance',
  foundationFee: 'R250,000',
  monthlyRetainer: 'R120,000',
  currency: 'ZAR',
  contractTerm: '12 months',
  salesOwner: 'Neo Morake',
  accountOwner: 'Neo Morake',
  onboardingStart: '2026-08-30',
  goLive: '2026-09-30',
  priority: 'High',
}

type Stakeholder = { name: string; role: string; type: string; email: string }

const initialStakeholders: Stakeholder[] = [
  { name: 'Sarah Mokoena', role: 'Marketing Director', type: 'Decision Maker', email: 'sarah@lgndry.co' },
  { name: 'David Khumalo', role: 'Head of Technology', type: 'Technical Stakeholder', email: 'david@lgndry.co' },
]

export function ClientSetupWorkflow() {
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState(initialData)
  const [plan, setPlan] = useState('Growth Partner')
  const [includedServices, setIncludedServices] = useState(() => new Set(['UNISON', 'Delivery Governance', 'LeadSense', 'CRM / Client OS', 'Automation']))
  const [customServices, setCustomServices] = useState<string[]>([])
  const [stakeholders, setStakeholders] = useState(initialStakeholders)
  const [stakeholderOpen, setStakeholderOpen] = useState(false)
  const [customServiceOpen, setCustomServiceOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [additionalTeam, setAdditionalTeam] = useState<string[]>([])
  const [logoUploaded, setLogoUploaded] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [notice, setNotice] = useState('')
  const [success, setSuccess] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [toggles, setToggles] = useState({ decision: true, billing: false, project: true })
  const [team, setTeam] = useState({
    account: 'Neo Morake', onboarding: 'Sarah Johnson', project: 'Amara Dlamini', strategy: 'Neo Morake', technology: 'James Carter', marketing: 'Lethabo Nkosi', creative: 'Zanele Khumalo',
  })
  const [template, setTemplate] = useState('Growth Partner')

  const update = (key: keyof ClientData, value: string) => setData((current) => ({ ...current, [key]: value }))

  const goToStep = (step: number) => {
    setCurrentStep(Math.max(0, Math.min(steps.length - 1, step)))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const continueSetup = () => {
    if (currentStep === 0 && (!data.companyName.trim() || !data.industry.trim())) {
      setShowErrors(true)
      setNotice('Complete the required company fields before continuing.')
      return
    }
    setShowErrors(false)
    goToStep(currentStep + 1)
  }

  const saveDraft = () => {
    setDraftSaved(true)
    setNotice('Draft saved locally — 10 Aug 2026, 14:32')
  }

  if (success) return <ClientCreated companyName={data.companyName} onCreateAnother={() => { setSuccess(false); goToStep(0) }} />

  return <>
    <WorkspaceHeader
      category="Operations"
      parent={{ label: 'Clients', href: '/operations/clients' }}
      title="Create Client"
      description="Set up the client's workspace, engagement and onboarding."
    />

    <div className="mx-auto max-w-6xl pb-28">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link href="/operations/clients" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to Clients</Link>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileClock className="size-4" /><span>Client setup</span><span className="rounded-md bg-warning-soft px-2 py-0.5 font-semibold text-warning">Draft</span></div>
      </div>

      <SetupProgress currentStep={currentStep} onStep={goToStep} />

      {draftSaved ? <DraftNotice onResume={() => { setDraftSaved(false); setNotice('Draft resumed.') }} onDiscard={() => { setDraftSaved(false); setNotice('Draft discarded.') }} /> : null}

      <div className="mt-5">
        {currentStep === 0 ? <CompanyStep data={data} update={update} logoUploaded={logoUploaded} setLogoUploaded={setLogoUploaded} showErrors={showErrors} /> : null}
        {currentStep === 1 ? <ContactsStep data={data} update={update} toggles={toggles} setToggles={setToggles} stakeholders={stakeholders} onAdd={() => setStakeholderOpen(true)} /> : null}
        {currentStep === 2 ? <EngagementStep data={data} update={update} plan={plan} setPlan={setPlan} /> : null}
        {currentStep === 3 ? <ServicesStep included={includedServices} custom={customServices} onToggle={(service) => setIncludedServices((current) => { const next = new Set(current); next.has(service) ? next.delete(service) : next.add(service); return next })} onAdd={() => setCustomServiceOpen(true)} /> : null}
        {currentStep === 4 ? <TeamStep team={team} setTeam={setTeam} additionalTeam={additionalTeam} onAdd={() => setTeamOpen(true)} /> : null}
        {currentStep === 5 ? <OnboardingStep data={data} update={update} template={template} setTemplate={setTemplate} team={team} /> : null}
        {currentStep === 6 ? <ReviewStep data={data} plan={plan} included={includedServices} custom={customServices} team={team} template={template} onEdit={goToStep} /> : null}
      </div>

      <ActionBar
        currentStep={currentStep}
        onBack={() => currentStep === 0 ? window.history.back() : goToStep(currentStep - 1)}
        onSave={saveDraft}
        onContinue={continueSetup}
        onCreate={() => setSuccess(true)}
      />
    </div>

    {notice ? <button type="button" onClick={() => setNotice('')} role="status" className="fixed right-6 bottom-24 z-40 flex max-w-sm items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-left text-sm font-medium text-primary-foreground shadow-xl"><CheckCircle2 className="size-4 text-brand" />{notice}<X className="ml-2 size-3.5 opacity-60" /></button> : null}
    <StakeholderDrawer open={stakeholderOpen} onClose={() => setStakeholderOpen(false)} onAdd={(stakeholder) => { setStakeholders((current) => [...current, stakeholder]); setStakeholderOpen(false); setNotice(`${stakeholder.name} added as a stakeholder.`) }} />
    <SimpleAddDialog open={customServiceOpen} title="Add Custom Service" label="Service name" placeholder="e.g. Executive Communications" onClose={() => setCustomServiceOpen(false)} onAdd={(name) => { setCustomServices((current) => [...current, name]); setIncludedServices((current) => new Set([...current, name])); setCustomServiceOpen(false); setNotice(`${name} added to the engagement.`) }} />
    <SimpleAddDialog open={teamOpen} title="Add Team Member" label="Team member" placeholder="e.g. Maya Patel — Delivery Support" onClose={() => setTeamOpen(false)} onAdd={(name) => { setAdditionalTeam((current) => [...current, name]); setTeamOpen(false); setNotice(`${name} added to the client team.`) }} />
  </>
}

function SetupProgress({ currentStep, onStep }: { currentStep: number; onStep: (step: number) => void }) {
  return <nav aria-label="Client setup progress" className="overflow-x-auto rounded-xl border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
    <ol className="flex min-w-[760px] items-center">
      {steps.map((step, index) => <li key={step} className="flex flex-1 items-center last:flex-none">
        <button type="button" onClick={() => onStep(index)} aria-current={index === currentStep ? 'step' : undefined} className="group flex items-center gap-2 text-left">
          <span className={cn('flex size-7 items-center justify-center rounded-full border text-[0.6875rem] font-bold transition-colors', index < currentStep ? 'border-brand bg-brand text-white' : index === currentStep ? 'border-foreground bg-foreground text-primary-foreground' : 'border-border bg-background text-muted-foreground')}>
            {index < currentStep ? <Check className="size-3.5" /> : String(index + 1).padStart(2, '0')}
          </span>
          <span className={cn('text-xs font-semibold whitespace-nowrap', index === currentStep ? 'text-foreground' : 'text-muted-foreground')}>{step}</span>
        </button>
        {index < steps.length - 1 ? <span className={cn('mx-3 h-px flex-1', index < currentStep ? 'bg-brand/50' : 'bg-border')} /> : null}
      </li>)}
    </ol>
  </nav>
}

function DraftNotice({ onResume, onDiscard }: { onResume: () => void; onDiscard: () => void }) {
  return <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/20 bg-info-soft/60 px-4 py-3">
    <div className="flex items-center gap-3"><FileClock className="size-5 text-info" /><div><p className="text-sm font-semibold">Client Setup <span className="ml-1 rounded bg-card px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">Draft</span></p><p className="text-xs text-muted-foreground">Last updated 10 Aug 2026, 14:32</p></div></div>
    <div className="flex gap-2"><button type="button" onClick={onDiscard} className="rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-card"><Trash2 className="mr-1.5 inline size-3.5" />Discard Draft</button><button type="button" onClick={onResume} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold">Resume Setup</button></div>
  </section>
}

function CompanyStep({ data, update, logoUploaded, setLogoUploaded, showErrors }: { data: ClientData; update: (key: keyof ClientData, value: string) => void; logoUploaded: boolean; setLogoUploaded: (value: boolean) => void; showErrors: boolean }) {
  return <StepHeading title="Company" description="Define the organization and the workspace UNISON will create for it.">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <Card title="Company Information" description="Core company details used across the client record.">
        <div className="mb-5 flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-foreground text-sm font-bold text-primary-foreground">{logoUploaded ? 'LG' : <Building2 className="size-5" />}</div>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Company logo</p><p className="text-xs text-muted-foreground">PNG, JPG or SVG · Recommended 512 × 512</p></div>
          <button type="button" onClick={() => setLogoUploaded(!logoUploaded)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold"><CloudUpload className="size-3.5" />{logoUploaded ? 'Replace' : 'Upload'}</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company Name" required value={data.companyName} onChange={(value) => update('companyName', value)} error={showErrors && !data.companyName.trim() ? 'Company name is required.' : undefined} completed={Boolean(data.companyName.trim())} />
          <Field label="Industry" required value={data.industry} onChange={(value) => update('industry', value)} options={['Brand & Digital', 'Financial Services', 'Technology', 'Professional Services', 'Property', 'Retail']} error={showErrors && !data.industry.trim() ? 'Industry is required.' : undefined} completed={Boolean(data.industry.trim())} />
          <Field label="Legal Entity Name" value={data.legalEntity} onChange={(value) => update('legalEntity', value)} />
          <Field label="Trading Name" value={data.tradingName} onChange={(value) => update('tradingName', value)} />
          <Field label="Company Registration Number" value={data.registration} onChange={(value) => update('registration', value)} />
          <Field label="Website" type="url" value={data.website} onChange={(value) => update('website', value)} />
          <Field label="Company Size" value={data.companySize} onChange={(value) => update('companySize', value)} options={['1–10', '11–50', '51–200', '201–500', '501+']} />
          <Field label="Primary Location" value={data.location} onChange={(value) => update('location', value)} />
          <Field label="Country" value={data.country} onChange={(value) => update('country', value)} options={['South Africa', 'United Kingdom', 'United States', 'United Arab Emirates', 'Other']} />
          <Field label="Timezone" value={data.timezone} onChange={(value) => update('timezone', value)} options={['Africa/Johannesburg', 'Europe/London', 'America/New_York', 'Asia/Dubai']} />
        </div>
      </Card>
      <aside className="h-fit rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Client Workspace</h3><span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">Draft</span></div>
        <div className="mt-5 space-y-4"><SummaryValue label="Workspace name" value={data.companyName || 'Untitled client'} /><SummaryValue label="Workspace ID" value="HIM-LGN-0427" mono /><SummaryValue label="Status" value="Draft" /></div>
        <div className="mt-5 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground"><Info className="mb-2 size-4" />The workspace is a visual preview until the final setup step is completed.</div>
      </aside>
    </div>
  </StepHeading>
}

function ContactsStep({ data, update, toggles, setToggles, stakeholders, onAdd }: { data: ClientData; update: (key: keyof ClientData, value: string) => void; toggles: { decision: boolean; billing: boolean; project: boolean }; setToggles: React.Dispatch<React.SetStateAction<{ decision: boolean; billing: boolean; project: boolean }>>; stakeholders: Stakeholder[]; onAdd: () => void }) {
  return <StepHeading title="Contacts" description="Capture the people who will shape decisions, delivery and billing.">
    <Card title="Primary Contact" description="The main relationship contact for this client workspace.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="First Name" value={data.firstName} onChange={(value) => update('firstName', value)} />
        <Field label="Last Name" value={data.lastName} onChange={(value) => update('lastName', value)} />
        <Field label="Job Title" value={data.jobTitle} onChange={(value) => update('jobTitle', value)} />
        <Field label="Department" value={data.department} onChange={(value) => update('department', value)} />
        <Field label="Email" type="email" value={data.email} onChange={(value) => update('email', value)} />
        <Field label="Phone" type="tel" value={data.phone} onChange={(value) => update('phone', value)} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ToggleRow label="Primary Decision Maker" checked={toggles.decision} onChange={() => setToggles((current) => ({ ...current, decision: !current.decision }))} />
        <ToggleRow label="Main Billing Contact" checked={toggles.billing} onChange={() => setToggles((current) => ({ ...current, billing: !current.billing }))} />
        <ToggleRow label="Main Project Contact" checked={toggles.project} onChange={() => setToggles((current) => ({ ...current, project: !current.project }))} />
      </div>
    </Card>
    <Card title="Additional Stakeholders" description="Add decision makers, technical stakeholders and delivery contacts." action={<button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold"><Plus className="size-3.5" />Add Stakeholder</button>}>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {stakeholders.map((stakeholder) => <div key={`${stakeholder.name}-${stakeholder.email}`} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-center">
          <div className="flex items-center gap-3"><Avatar name={stakeholder.name} /><div><p className="text-sm font-semibold">{stakeholder.name}</p><p className="text-xs text-muted-foreground">{stakeholder.email}</p></div></div>
          <div><p className="text-sm font-medium">{stakeholder.role}</p><p className="text-xs text-muted-foreground">{stakeholder.type}</p></div>
          <button type="button" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Edit</button>
        </div>)}
      </div>
    </Card>
  </StepHeading>
}

function EngagementStep({ data, update, plan, setPlan }: { data: ClientData; update: (key: keyof ClientData, value: string) => void; plan: string; setPlan: (plan: string) => void }) {
  return <StepHeading title="Engagement" description="Define the commercial agreement and the operating model for this relationship.">
    <Card title="UNISON Plan" description="Choose the plan that best reflects the signed engagement.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{plans.map((option) => <button type="button" key={option.name} onClick={() => setPlan(option.name)} className={cn('rounded-xl border p-4 text-left transition-colors', plan === option.name ? 'border-foreground bg-foreground text-primary-foreground' : 'border-border hover:border-foreground/30')}>
        <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{option.name}</p>{plan === option.name ? <CheckCircle2 className="size-4 text-brand" /> : null}</div><p className={cn('mt-3 text-sm font-semibold', plan === option.name ? 'text-white' : 'text-foreground')}>{option.price}</p><p className={cn('mt-2 text-xs leading-5', plan === option.name ? 'text-white/65' : 'text-muted-foreground')}>{option.description}</p>
      </button>)}</div>
    </Card>
    <Card title="Commercial Agreement" description="Record the contract, fee structure and commercial ownership.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Engagement Type" value={data.engagementType} onChange={(value) => update('engagementType', value)} options={['Strategic partnership', 'Retainer', 'Project', 'Advisory']} />
        <Field label="Contract Start Date" type="date" value={data.contractStart} onChange={(value) => update('contractStart', value)} />
        <Field label="Contract End Date" type="date" value={data.contractEnd} onChange={(value) => update('contractEnd', value)} />
        <Field label="Retainer Start Date" type="date" value={data.retainerStart} onChange={(value) => update('retainerStart', value)} />
        <Field label="Billing Cycle" value={data.billingCycle} onChange={(value) => update('billingCycle', value)} options={['Monthly in advance', 'Monthly in arrears', 'Quarterly', 'Milestone based']} />
        <Field label="Implementation / Foundation Fee" value={data.foundationFee} onChange={(value) => update('foundationFee', value)} />
        <Field label="Monthly Retainer" value={data.monthlyRetainer} onChange={(value) => update('monthlyRetainer', value)} />
        <Field label="Currency" value={data.currency} onChange={(value) => update('currency', value)} options={['ZAR', 'USD', 'GBP', 'EUR']} />
        <Field label="Contract Term" value={data.contractTerm} onChange={(value) => update('contractTerm', value)} options={['3 months', '6 months', '12 months', '24 months', 'Custom']} />
        <Field label="Sales Owner" value={data.salesOwner} onChange={(value) => update('salesOwner', value)} options={people} />
        <Field label="Account Owner" value={data.accountOwner} onChange={(value) => update('accountOwner', value)} options={people} />
      </div>
    </Card>
  </StepHeading>
}

function ServicesStep({ included, custom, onToggle, onAdd }: { included: Set<string>; custom: string[]; onToggle: (service: string) => void; onAdd: () => void }) {
  const services = [...serviceCatalogue.map(([name, description, level]) => ({ name, description, level })), ...custom.map((name) => ({ name, description: 'Custom capability configured for this engagement', level: 'Custom' }))]
  return <StepHeading title="Services & Capabilities" description="Select the services included in this engagement.">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {services.map((service) => { const selected = included.has(service.name); return <button type="button" key={service.name} onClick={() => onToggle(service.name)} className={cn('min-h-36 rounded-xl border bg-card p-4 text-left shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] transition-colors', selected ? 'border-brand/50 ring-1 ring-brand/20' : 'border-border hover:border-foreground/25')}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{service.name}</p><p className="mt-1 text-xs text-muted-foreground">{service.level}</p></div><span className={cn('flex size-6 items-center justify-center rounded-full', selected ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>{selected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}</span></div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{service.description}</p><p className={cn('mt-3 text-[0.6875rem] font-semibold uppercase tracking-wide', selected ? 'text-brand' : 'text-muted-foreground')}>{selected ? 'Included' : 'Not Included'}</p>
      </button> })}
      <button type="button" onClick={onAdd} className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 text-sm font-semibold text-muted-foreground hover:border-foreground/30 hover:text-foreground"><Plus className="mb-2 size-5" />Add Custom Service</button>
    </div>
  </StepHeading>
}

type TeamState = { account: string; onboarding: string; project: string; strategy: string; technology: string; marketing: string; creative: string }

function TeamStep({ team, setTeam, additionalTeam, onAdd }: { team: TeamState; setTeam: React.Dispatch<React.SetStateAction<TeamState>>; additionalTeam: string[]; onAdd: () => void }) {
  const assignments: Array<[keyof TeamState, string, boolean]> = [['account', 'Account Owner', true], ['onboarding', 'Onboarding Manager', false], ['project', 'Project Lead', false], ['strategy', 'Strategy Lead', false], ['technology', 'Technology Lead', false], ['marketing', 'Marketing Lead', false], ['creative', 'Creative Lead', false]]
  return <StepHeading title="Client Team" description="Assign internal ownership for the client relationship.">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <Card title="Team Assignments" description="Give each workstream a clear internal owner." action={<button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold"><UserRoundPlus className="size-3.5" />Add Team Member</button>}>
        <div className="grid gap-3 md:grid-cols-2">{assignments.map(([key, label, required]) => <PersonSelect key={key} label={label} required={required} value={team[key]} onChange={(value) => setTeam((current) => ({ ...current, [key]: value }))} />)}</div>
        {additionalTeam.length ? <div className="mt-5 border-t border-border pt-4"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional team</p><div className="flex flex-wrap gap-2">{additionalTeam.map((person) => <span key={person} className="rounded-lg border border-border px-3 py-2 text-xs font-medium">{person}</span>)}</div></div> : null}
      </Card>
      <aside className="h-fit rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
        <div className="flex items-center gap-2"><UsersRound className="size-4" /><h3 className="font-semibold">Ownership Summary</h3></div>
        <div className="mt-5 space-y-4"><Ownership label="Account Owner" name={team.account} /><Ownership label="Onboarding Manager" name={team.onboarding} /><Ownership label="Technology Lead" name={team.technology} /></div>
      </aside>
    </div>
  </StepHeading>
}

function OnboardingStep({ data, update, template, setTemplate, team }: { data: ClientData; update: (key: keyof ClientData, value: string) => void; template: string; setTemplate: (value: string) => void; team: TeamState }) {
  const checklist = ['Contract Signed', 'Internal Handover', 'Discovery', 'Information Collection', 'Access & Credentials', 'Brand & Asset Collection', 'Systems Configuration', 'Integrations', 'QA & Validation', 'Client Readiness', 'Go-Live']
  return <StepHeading title="Onboarding" description="Configure the onboarding plan that will live inside the client record.">
    <Card title="Onboarding Setup" description="Set the working dates, priority and delivery template.">
      <div className="grid gap-4 md:grid-cols-3"><Field label="Onboarding Start Date" type="date" value={data.onboardingStart} onChange={(value) => update('onboardingStart', value)} /><Field label="Target Go-Live Date" type="date" value={data.goLive} onChange={(value) => update('goLive', value)} /><Field label="Priority" value={data.priority} onChange={(value) => update('priority', value)} options={['Normal', 'High', 'Critical']} /></div>
      <div className="mt-5"><p className="mb-3 text-sm font-medium">Onboarding Template</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{['Signature Partner', 'Growth Partner', 'Private Partner', 'Custom'].map((option) => <button type="button" key={option} onClick={() => setTemplate(option)} className={cn('rounded-xl border p-4 text-left text-sm font-semibold', template === option ? 'border-foreground bg-foreground text-primary-foreground' : 'border-border')}>{option}{template === option ? <Check className="float-right size-4 text-brand" /> : null}</button>)}</div></div>
    </Card>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <Card title="Onboarding Plan" description="A visual preview of the checklist created with this client.">
        <div className="divide-y divide-border rounded-xl border border-border">{checklist.map((item, index) => <div key={item} className="flex items-center gap-3 px-4 py-3"><span className={cn('flex size-6 items-center justify-center rounded-full', index === 0 ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground')}>{index === 0 ? <Check className="size-3.5" /> : <Clock3 className="size-3.5" />}</span><span className="text-sm font-medium">{item}</span><span className={cn('ml-auto text-xs font-semibold', index === 0 ? 'text-brand' : 'text-muted-foreground')}>{index === 0 ? 'Ready' : 'Pending'}</span></div>)}</div>
      </Card>
      <aside className="h-fit rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><h3 className="font-semibold">Plan Summary</h3><div className="mt-5 space-y-4"><SummaryValue label="Estimated duration" value="32 days" /><SummaryValue label="Target go-live" value="30 September 2026" /><Ownership label="Onboarding manager" name={team.onboarding} /></div></aside>
    </div>
  </StepHeading>
}

function ReviewStep({ data, plan, included, custom, team, template, onEdit }: { data: ClientData; plan: string; included: Set<string>; custom: string[]; team: TeamState; template: string; onEdit: (step: number) => void }) {
  const selectedServices = [...serviceCatalogue.map(([name]) => name), ...custom].filter((service) => included.has(service))
  return <StepHeading title="Review & Create" description="Confirm the workspace, engagement and onboarding plan before creation.">
    <div className="grid gap-4 xl:grid-cols-2">
      <ReviewCard title="Company" onEdit={() => onEdit(0)}><ReviewGrid items={[['Company', data.companyName], ['Industry', data.industry], ['Website', data.website], ['Location', `${data.location}, ${data.country}`]]} /></ReviewCard>
      <ReviewCard title="Primary Contact" onEdit={() => onEdit(1)}><ReviewGrid items={[['Name', `${data.firstName} ${data.lastName}`], ['Role', data.jobTitle], ['Email', data.email], ['Phone', data.phone]]} /></ReviewCard>
      <ReviewCard title="Engagement" onEdit={() => onEdit(2)}><ReviewGrid items={[['Plan', plan], ['Contract dates', '01 Sep 2026 – 31 Aug 2027'], ['Monthly retainer', data.monthlyRetainer], ['Account owner', team.account]]} /></ReviewCard>
      <ReviewCard title="Services" onEdit={() => onEdit(3)}><div className="flex flex-wrap gap-2">{selectedServices.map((service) => <span key={service} className="rounded-lg bg-brand-soft px-2.5 py-1.5 text-xs font-semibold text-brand">{service}</span>)}</div></ReviewCard>
      <ReviewCard title="Team" onEdit={() => onEdit(4)}><div className="grid gap-3 sm:grid-cols-2"><Ownership label="Account Owner" name={team.account} /><Ownership label="Onboarding Manager" name={team.onboarding} /><Ownership label="Project Lead" name={team.project} /><Ownership label="Technology Lead" name={team.technology} /></div></ReviewCard>
      <ReviewCard title="Onboarding" onEdit={() => onEdit(5)}><ReviewGrid items={[['Start date', '30 August 2026'], ['Target launch', '30 September 2026'], ['Template', template], ['Onboarding manager', team.onboarding]]} /></ReviewCard>
    </div>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-info/20 bg-info-soft/50 p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-info" /><div><p className="font-semibold">Ready to create the client workspace</p><p className="mt-1 text-muted-foreground">Confirm the company, engagement, team and onboarding plan before creating the workspace.</p></div></div>
  </StepHeading>
}

function ActionBar({ currentStep, onBack, onSave, onContinue, onCreate }: { currentStep: number; onBack: () => void; onSave: () => void; onContinue: () => void; onCreate: () => void }) {
  const final = currentStep === steps.length - 1
  return <div className="sticky bottom-4 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-[0_12px_36px_rgba(16,32,46,0.12)] backdrop-blur">
    <div><p className="text-xs font-semibold">Step {currentStep + 1} of {steps.length}</p><p className="text-[0.6875rem] text-muted-foreground">{steps[currentStep]} setup</p></div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"><ArrowLeft className="size-4" />Back</button><button type="button" onClick={onSave} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"><Save className="size-4" />Save Draft</button>{final ? <button type="button" onClick={onCreate} className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-primary-foreground">Create Client Workspace<CheckCircle2 className="size-4" /></button> : <button type="button" onClick={onContinue} className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-primary-foreground">Continue<ArrowRight className="size-4" /></button>}</div>
  </div>
}

function ClientCreated({ companyName, onCreateAnother }: { companyName: string; onCreateAnother: () => void }) {
  return <>
    <WorkspaceHeader category="Operations" parent={{ label: 'Clients', href: '/operations/clients' }} title="Client Workspace Created" />
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-10 text-center shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand"><CheckCircle2 className="size-7" /></span><h2 className="mt-5 text-2xl font-bold">Client workspace created</h2><p className="mt-2 text-sm text-muted-foreground">{companyName || 'LGNDRY.CO'} has been added to UNISON.</p><div className="mx-auto mt-7 grid max-w-md gap-3 rounded-xl border border-border bg-muted/30 p-4 text-left sm:grid-cols-3"><SummaryValue label="Status" value="Onboarding" /><SummaryValue label="Plan" value="Growth Partner" /><SummaryValue label="Go-live" value="30 Sep 2026" /></div><div className="mt-7 flex flex-wrap justify-center gap-2"><button type="button" onClick={onCreateAnother} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Create Another Client</button><Link href="/operations/clients/lgndry-co" className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground">View Client<ArrowRight className="size-4" /></Link></div></div>
  </>
}

function StepHeading({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><div className="mb-4"><h2 className="text-xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><div className="space-y-5">{children}</div></section>
}

function Card({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>{children}</section>
}

function Field({ label, value, onChange, type = 'text', options, required, error, completed, disabled }: { label: string; value: string; onChange: (value: string) => void; type?: string; options?: readonly string[]; required?: boolean; error?: string; completed?: boolean; disabled?: boolean }) {
  const fieldClass = cn('mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground', error ? 'border-destructive focus:border-destructive focus:ring-destructive/15' : 'border-border', completed && !error ? 'pr-9' : '')
  return <label className="relative block"><span className="text-sm font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</span><span className="relative block">{options ? <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={fieldClass}><option value="">Select {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={fieldClass} />}{completed && !error ? <CheckCircle2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-brand" /> : null}</span>{error ? <span className="mt-1.5 flex items-center gap-1 text-xs text-destructive"><CircleAlert className="size-3.5" />{error}</span> : null}</label>
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <button type="button" onClick={onChange} role="switch" aria-checked={checked} className="flex items-center justify-between rounded-xl border border-border p-3 text-left"><span className="text-xs font-semibold">{label}</span><span className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-foreground' : 'bg-muted')}><span className={cn('absolute top-0.5 size-4 rounded-full bg-card shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} /></span></button>
}

function PersonSelect({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="rounded-xl border border-border p-3"><span className="text-xs font-medium text-muted-foreground">{label}{required ? <span className="text-destructive"> *</span> : null}</span><span className="mt-2 flex items-center gap-3"><Avatar name={value} /><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none">{people.map((person) => <option key={person}>{person}</option>)}</select></span></label>
}

function Avatar({ name }: { name: string }) { return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-primary-foreground">{name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span> }

function Ownership({ label, name }: { label: string; name: string }) { return <div className="flex items-center gap-3"><Avatar name={name} /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{name}</p></div></div> }

function SummaryValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={cn('mt-1 text-sm font-semibold', mono ? 'font-mono' : '')}>{value}</p></div> }

function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3><button type="button" onClick={onEdit} className="text-xs font-semibold hover:text-brand">Edit</button></div>{children}</section> }

function ReviewGrid({ items }: { items: Array<[string, string]> }) { return <div className="grid gap-4 sm:grid-cols-2">{items.map(([label, value]) => <SummaryValue key={label} label={label} value={value} />)}</div> }

function StakeholderDrawer({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (stakeholder: Stakeholder) => void }) {
  const [name, setName] = useState('Thandi Ndlovu')
  const [role, setRole] = useState('Finance Director')
  const [type, setType] = useState('Billing Stakeholder')
  const [email, setEmail] = useState('thandi@lgndry.co')
  if (!open) return null
  return <div className="fixed inset-0 z-50"><button type="button" aria-label="Close stakeholder drawer" onClick={onClose} className="absolute inset-0 bg-foreground/25" /><aside className="absolute top-0 right-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Add Stakeholder</h2><p className="mt-1 text-sm text-muted-foreground">Add another client contact to this workspace.</p></div><button type="button" onClick={onClose} className="rounded-lg border border-border p-2"><X className="size-4" /></button></div><form onSubmit={(event) => { event.preventDefault(); onAdd({ name, role, type, email }) }} className="mt-7 space-y-4"><Field label="Full Name" value={name} onChange={setName} /><Field label="Job Title" value={role} onChange={setRole} /><Field label="Stakeholder Type" value={type} onChange={setType} options={['Decision Maker', 'Technical Stakeholder', 'Billing Stakeholder', 'Project Stakeholder']} /><Field label="Email" type="email" value={email} onChange={setEmail} /><div className="flex justify-end gap-2 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground">Add Stakeholder</button></div></form></aside></div>
}

function SimpleAddDialog({ open, title, label, placeholder, onClose, onAdd }: { open: boolean; title: string; label: string; placeholder: string; onClose: () => void; onAdd: (value: string) => void }) {
  const [value, setValue] = useState('')
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-5"><button type="button" aria-label={`Close ${title}`} onClick={onClose} className="absolute inset-0 bg-foreground/25" /><form onSubmit={(event) => { event.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue('') } }} className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-bold">{title}</h2><button type="button" onClick={onClose} className="rounded-lg border border-border p-2"><X className="size-4" /></button></div><label className="mt-5 block text-sm font-medium">{label}<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground">Add</button></div></form></div>
}
