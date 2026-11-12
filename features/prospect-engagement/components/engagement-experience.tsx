'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Code2,
  Compass,
  Film,
  Handshake,
  Mail,
  Mountain,
  Phone,
  Plus,
} from 'lucide-react'

import {
  CONTACT_PREFERENCES,
  COUNTRIES,
  INDUSTRIES,
  OBJECTIVES,
  SERVICES,
  TIMELINES,
  labelForIndustry,
  labelForObjective,
  labelForService,
  labelForTimeline,
  type ServiceDefinition,
  type ServiceId,
} from '../catalog'
import type { PublicEngagementContext } from '../types'
import { HimarkWordmark } from './himark-wordmark'
import { Dropdown } from '@/components/ui/select'

type Attribution = { source: string; medium: string; campaign: string; term: string; content: string }
type Details = {
  organisationName: string
  industry: string
  fullName: string
  email: string
  jobTitle: string
  phone: string
  country: string
  contactPreference: 'email' | 'telephone'
  privacyAcknowledged: boolean
  marketingConsent: boolean
}

const STAGES = ['Your Interest', 'Your Priorities', 'Your Details', 'Review & Submit'] as const
const EMPTY_DETAILS: Details = {
  organisationName: '', industry: '', fullName: '', email: '', jobTitle: '', phone: '', country: '',
  contactPreference: 'email', privacyAcknowledged: false, marketingConsent: false,
}

const ICONS: Record<ServiceDefinition['icon'], ComponentType<{ className?: string }>> = {
  briefcase: BriefcaseBusiness,
  code: Code2,
  mountain: Mountain,
  film: Film,
  handshake: Handshake,
  compass: Compass,
}

export function EngagementExperience({ context, attribution }: { context: PublicEngagementContext; attribution: Attribution }) {
  const services = useMemo(
    () => SERVICES.filter((service) => context.config.enabledServices.includes(service.id)),
    [context.config.enabledServices],
  )
  const [step, setStep] = useState(1)
  const [selectedServices, setSelectedServices] = useState<ServiceId[]>([])
  const [primaryService, setPrimaryService] = useState<ServiceId | null>(null)
  const [objective, setObjective] = useState('')
  const [timeline, setTimeline] = useState('')
  const [additionalInformation, setAdditionalInformation] = useState('')
  const [showAdditional, setShowAdditional] = useState(false)
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS)
  const [website, setWebsite] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)
  const startedAt = useRef('')
  const submissionKey = useRef('')

  useEffect(() => {
    startedAt.current = new Date().toISOString()
    submissionKey.current = crypto.randomUUID()
    if (context.source) {
      void fetch('/api/engage/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: context.source.token }),
        keepalive: true,
      })
    }
  }, [context.source])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step, complete])

  const resolvedPrimary = primaryService ?? (selectedServices.length === 1 ? selectedServices[0] : null)
  const objectives = resolvedPrimary ? OBJECTIVES[resolvedPrimary] : []

  function toggleService(id: ServiceId) {
    setError('')
    setObjective('')
    setTimeline('')
    setPrimaryService(null)
    setSelectedServices((current) => {
      if (id === 'not-sure') return current.includes(id) ? [] : ['not-sure']
      const withoutUnsure = current.filter((item) => item !== 'not-sure')
      return withoutUnsure.includes(id) ? withoutUnsure.filter((item) => item !== id) : [...withoutUnsure, id]
    })
  }

  function goTo(next: number) {
    setError('')
    setStep(next)
  }

  function continueFromInterest() {
    if (!selectedServices.length) return setError('Choose at least one area to continue.')
    if (selectedServices.length === 1) setPrimaryService(selectedServices[0])
    goTo(2)
  }

  function continueFromPriorities() {
    if (!resolvedPrimary) return setError('Choose the area you would like us to focus on first.')
    if (!objective) return setError('Choose the outcome that matters most to you.')
    if (!timeline) return setError('Choose when you are considering getting started.')
    goTo(3)
  }

  function continueFromDetails() {
    const required: Array<[keyof Details, string]> = [
      ['organisationName', 'Add your organisation name.'],
      ['industry', 'Choose your industry.'],
      ['fullName', 'Add your full name.'],
      ['email', 'Add your email address.'],
    ]
    for (const [field, message] of required) if (!String(details[field]).trim()) return setError(message)
    if (!/^\S+@\S+\.\S+$/.test(details.email)) return setError('Enter a valid email address.')
    if (details.contactPreference === 'telephone' && !details.phone.trim()) return setError('Add a contact number if you prefer a telephone call.')
    if (!details.privacyAcknowledged) return setError('Please acknowledge the Privacy Notice to continue.')
    goTo(4)
  }

  async function submit() {
    if (!resolvedPrimary || submitting) return
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/engage/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionKey: submissionKey.current || crypto.randomUUID(),
          formVersionId: context.formVersionId,
          selectedServices,
          primaryService: resolvedPrimary,
          primaryObjective: objective,
          expectedTimeline: timeline,
          additionalInformation,
          ...details,
          sourceToken: context.source?.token ?? null,
          channel: context.source?.channel ?? 'corporate-website',
          utm: attribution,
          startedAt: startedAt.current || new Date(Date.now() - 3_000).toISOString(),
          website,
        }),
      })
      const body = await response.json().catch(() => ({})) as { message?: string }
      if (!response.ok) throw new Error(body.message || 'We could not send your enquiry. Please try again.')
      setComplete(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not send your enquiry. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (complete) return <Success />

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F7F6F3] px-4 py-8 text-[#0F1115] sm:px-6 sm:py-12 lg:py-16">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-36 h-[34rem] w-[34rem] rotate-12 bg-[linear-gradient(135deg,rgba(247,246,243,0.96),rgba(183,208,227,0.58))] [clip-path:polygon(0_0,100%_0,35%_100%,0_72%)]" />
        <div className="absolute right-[-16rem] bottom-[-11rem] h-[42rem] w-[50rem] -rotate-6 bg-[linear-gradient(135deg,rgba(183,208,227,0.52),rgba(47,93,124,0.16))] [clip-path:polygon(38%_0,100%_14%,100%_100%,0_100%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <header className="text-center">
          <HimarkWordmark />
          <div className="mx-auto mt-6 h-0.5 w-12 bg-[#2F5D7C]" />
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]">{context.config.headline}</h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-[#3E4B59] sm:text-base">{context.config.supportingText}</p>
        </header>

        <section className="mt-8 overflow-hidden rounded-[1.6rem] border border-[#B7D0E3]/80 bg-[#F7F6F3]/95 shadow-[0_25px_80px_-42px_rgba(11,39,66,0.46)] backdrop-blur-sm sm:mt-10">
          <Progress step={step} />
          <div className="px-5 py-8 sm:px-10 sm:py-10 lg:px-14">
            {error ? <div role="alert" className="mb-7 border border-[#d44a4a]/25 bg-[#fff5f5] px-4 py-3 text-sm text-[#a62f2f]">{error}</div> : null}

            {step === 1 ? (
              <Stage title="What would you like to explore with HIMARK?" supporting="Select one or more areas you'd like to explore.">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {services.map((service) => <ServiceCard key={service.id} service={service} selected={selectedServices.includes(service.id)} onClick={() => toggleService(service.id)} />)}
                </div>
                <Actions onContinue={continueFromInterest} />
              </Stage>
            ) : null}

            {step === 2 ? (
              <Stage title="What would you most like to achieve?" supporting="A few focused choices will help us connect you with the right HIMARK representative.">
                {selectedServices.length > 1 ? (
                  <Question number="01" title="Which area would you like us to focus on first?">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {services.filter((service) => selectedServices.includes(service.id)).map((service) => (
                        <CompactChoice key={service.id} selected={primaryService === service.id} onClick={() => { setPrimaryService(service.id); setObjective(''); setTimeline(''); setError('') }}>{service.label}</CompactChoice>
                      ))}
                    </div>
                  </Question>
                ) : null}

                {resolvedPrimary ? (
                  <Question number={selectedServices.length > 1 ? '02' : '01'} title="What would you most like to achieve?">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {objectives.map(([id, label]) => <CompactChoice key={id} selected={objective === id} onClick={() => { setObjective(id); setError('') }}>{label}</CompactChoice>)}
                    </div>
                  </Question>
                ) : null}

                {objective ? (
                  <Question number={selectedServices.length > 1 ? '03' : '02'} title="When are you considering getting started?">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {TIMELINES.map(([id, label]) => <CompactChoice key={id} selected={timeline === id} onClick={() => { setTimeline(id); setError('') }}>{label}</CompactChoice>)}
                    </div>
                  </Question>
                ) : null}

                {timeline ? (
                  <div className="mt-7 border-t border-[#B7D0E3] pt-6">
                    <button type="button" onClick={() => setShowAdditional((value) => !value)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#2F5D7C]">
                      <Plus className={`size-4 transition-transform ${showAdditional ? 'rotate-45' : ''}`} />
                      Is there anything else you&apos;d like us to know? <span className="font-normal text-[#3E4B59]">Optional</span>
                    </button>
                    {showAdditional ? (
                      <label className="mt-4 block text-sm font-medium">
                        <span className="sr-only">Additional information</span>
                        <textarea value={additionalInformation} maxLength={500} onChange={(event) => setAdditionalInformation(event.target.value)} rows={4} className={inputClass} placeholder="Share any helpful context in a few words." />
                        <span className="mt-1 block text-right text-xs font-normal text-[#3E4B59]">{additionalInformation.length}/500</span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
                <Actions back onBack={() => goTo(1)} onContinue={continueFromPriorities} disabled={!timeline} />
              </Stage>
            ) : null}

            {step === 3 ? (
              <Stage title="Tell us a little about your organisation." supporting="We'll use these details to connect you with the right HIMARK representative.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Organisation name" required><input className={inputClass} value={details.organisationName} onChange={(event) => updateDetail(setDetails, 'organisationName', event.target.value)} autoComplete="organization" /></Field>
                  <Field label="Industry" required><Dropdown className={inputClass} value={details.industry} onChange={(event) => updateDetail(setDetails, 'industry', event.target.value)}><option value="">Select an industry</option>{INDUSTRIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Dropdown></Field>
                  <Field label="Full name" required><input className={inputClass} value={details.fullName} onChange={(event) => updateDetail(setDetails, 'fullName', event.target.value)} autoComplete="name" /></Field>
                  <Field label="Email address" required><input className={inputClass} type="email" value={details.email} onChange={(event) => updateDetail(setDetails, 'email', event.target.value)} autoComplete="email" /></Field>
                  <Field label="Position / Job Title"><input className={inputClass} value={details.jobTitle} onChange={(event) => updateDetail(setDetails, 'jobTitle', event.target.value)} autoComplete="organization-title" /></Field>
                  <Field label="Contact number" required={details.contactPreference === 'telephone'}><input className={inputClass} type="tel" value={details.phone} onChange={(event) => updateDetail(setDetails, 'phone', event.target.value)} autoComplete="tel" placeholder="+27" /></Field>
                  <Field label="Country"><Dropdown className={inputClass} value={details.country} onChange={(event) => updateDetail(setDetails, 'country', event.target.value)}><option value="">Select a country</option>{COUNTRIES.map((country) => <option key={country}>{country}</option>)}</Dropdown></Field>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">How would you prefer us to contact you?</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {CONTACT_PREFERENCES.map(([id, label]) => (
                        <CompactChoice key={id} selected={details.contactPreference === id} onClick={() => updateDetail(setDetails, 'contactPreference', id)}>
                          <span className="inline-flex items-center gap-2">{id === 'email' ? <Mail className="size-4" /> : <Phone className="size-4" />}{label}</span>
                        </CompactChoice>
                      ))}
                    </div>
                  </fieldset>
                </div>

                <div className="mt-7 space-y-3 border-t border-[#B7D0E3] pt-6 text-sm leading-6 text-[#3E4B59]">
                  <p>HIMARK will use these details to review your enquiry and connect you with the right representative. Read the <a href={context.config.privacyNoticeUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#2F5D7C] underline underline-offset-2">HIMARK Privacy Notice</a>.</p>
                  <CheckLine checked={details.privacyAcknowledged} onChange={(checked) => updateDetail(setDetails, 'privacyAcknowledged', checked)} required>I acknowledge the Privacy Notice and consent to HIMARK using my information to respond to this enquiry.</CheckLine>
                  <CheckLine checked={details.marketingConsent} onChange={(checked) => updateDetail(setDetails, 'marketingConsent', checked)}>I would also like to receive occasional HIMARK insights and marketing communications.</CheckLine>
                </div>
                <input aria-hidden tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} className="absolute -left-[10000px] h-px w-px" />
                <Actions back onBack={() => goTo(2)} onContinue={continueFromDetails} />
              </Stage>
            ) : null}

            {step === 4 && resolvedPrimary ? (
              <Stage title="Review your enquiry." supporting="Please check the information below before sending it to HIMARK.">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Summary title="Your interest" onEdit={() => goTo(1)} rows={[
                    ['Selected services', selectedServices.map(labelForService).join(', ')],
                    ['Primary interest', labelForService(resolvedPrimary)],
                  ]} />
                  <Summary title="Your priorities" onEdit={() => goTo(2)} rows={[
                    ['Main objective', labelForObjective(resolvedPrimary, objective)],
                    ['Expected timeline', labelForTimeline(timeline)],
                    ...(additionalInformation ? [['Additional information', additionalInformation] as [string, string]] : []),
                  ]} />
                  <Summary title="Your organisation" onEdit={() => goTo(3)} rows={[
                    ['Organisation name', details.organisationName],
                    ['Industry', labelForIndustry(details.industry)],
                    ...(details.country ? [['Country', details.country] as [string, string]] : []),
                  ]} />
                  <Summary title="Your contact details" onEdit={() => goTo(3)} rows={[
                    ['Full name', details.fullName],
                    ...(details.jobTitle ? [['Position', details.jobTitle] as [string, string]] : []),
                    ['Email address', details.email],
                    ...(details.phone ? [['Telephone', details.phone] as [string, string]] : []),
                    ['Preferred contact', details.contactPreference === 'email' ? 'Email' : 'Telephone'],
                  ]} />
                </div>
                <Actions back onBack={() => goTo(3)} onContinue={submit} submit pending={submitting} />
              </Stage>
            ) : null}
          </div>
        </section>
        <p className="mt-5 text-center text-[0.68rem] tracking-[0.14em] text-[#3E4B59] uppercase">A secure HIMARK engagement experience</p>
      </div>
    </main>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <ol aria-label="Enquiry progress" className="grid grid-cols-4 border-b border-[#B7D0E3] bg-[#B7D0E3]/15 px-4 sm:px-10">
      {STAGES.map((label, index) => {
        const number = index + 1
        const active = number === step
        const done = number < step
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className={`relative flex min-h-20 flex-col items-center justify-center gap-1 text-center ${active ? 'text-[#0B2742]' : 'text-[#3E4B59]'}`}>
            <span className={`flex size-8 items-center justify-center rounded-full border text-xs font-semibold ${active ? 'border-[#0B2742] bg-[#0B2742] text-[#F7F6F3]' : done ? 'border-[#2F5D7C] bg-[#B7D0E3]/45 text-[#0B2742]' : 'border-[#B7D0E3] bg-[#F7F6F3]'}`}>{done ? <Check className="size-4" /> : number}</span>
            <span className="hidden text-xs font-medium sm:block">{label}</span>
            {active ? <span className="absolute bottom-0 h-0.5 w-full max-w-32 bg-[#2F5D7C]" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function Stage({ title, supporting, children }: { title: string; supporting: string; children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><div className="mb-8 text-center"><h2 className="text-2xl font-semibold tracking-[-0.035em] text-[#0B2742] sm:text-3xl">{title}</h2><p className="mt-2 text-sm leading-6 text-[#3E4B59]">{supporting}</p></div>{children}</div>
}

function Question({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <fieldset className="mt-7 first:mt-0"><legend className="mb-3 flex items-center gap-3 text-sm font-semibold"><span className="text-[0.66rem] tracking-[0.16em] text-[#2F5D7C]">{number}</span>{title}</legend>{children}</fieldset>
}

function ServiceCard({ service, selected, onClick }: { service: ServiceDefinition; selected: boolean; onClick: () => void }) {
  const Icon = ICONS[service.icon]
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`group relative min-h-40 border p-5 text-left transition-all duration-200 ${selected ? 'border-[#2F5D7C] bg-[#B7D0E3]/35 shadow-[0_12px_28px_-22px_rgba(47,93,124,0.58)]' : 'border-[#B7D0E3] bg-[#F7F6F3] hover:-translate-y-0.5 hover:border-[#2F5D7C] hover:shadow-[0_12px_30px_-24px_rgba(11,39,66,0.4)]'}`}>
      <span className={`flex size-10 items-center justify-center rounded-full ${selected ? 'bg-[#2F5D7C] text-[#F7F6F3]' : 'bg-[#B7D0E3]/35 text-[#0B2742]'}`}><Icon className="size-5" /></span>
      <span className="mt-4 block text-sm font-semibold">{service.label}</span>
      <span className="mt-2 block text-xs leading-5 text-[#3E4B59]">{service.description}</span>
      {selected ? <CheckCircle2 className="absolute top-4 right-4 size-5 text-[#2F5D7C]" /> : null}
    </button>
  )
}

function CompactChoice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`flex min-h-14 items-center justify-between gap-3 border px-4 py-3 text-left text-sm leading-5 transition-colors ${selected ? 'border-[#2F5D7C] bg-[#B7D0E3]/35 font-semibold text-[#0B2742]' : 'border-[#B7D0E3] bg-[#F7F6F3] hover:border-[#2F5D7C]'}`}><span>{children}</span>{selected ? <Check className="size-4 shrink-0 text-[#2F5D7C]" /> : null}</button>
}

function Actions({ back, onBack, onContinue, disabled, submit, pending }: { back?: boolean; onBack?: () => void; onContinue: () => void; disabled?: boolean; submit?: boolean; pending?: boolean }) {
  return <div className="mt-9 flex flex-col-reverse gap-3 border-t border-[#B7D0E3] pt-6 sm:flex-row sm:items-center sm:justify-between">{back ? <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[#3E4B59]"><ArrowLeft className="size-4" />Back</button> : <a href="https://himark.co.za" className="px-4 py-3 text-center text-sm font-medium text-[#3E4B59]">Cancel</a>}<button type="button" disabled={disabled || pending} onClick={onContinue} className="inline-flex min-w-56 items-center justify-center gap-3 bg-[linear-gradient(100deg,#0B2742,#2F5D7C)] px-7 py-3.5 text-sm font-semibold tracking-[0.14em] text-[#F7F6F3] uppercase shadow-[0_14px_28px_-18px_rgba(11,39,66,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">{pending ? 'Sending…' : submit ? 'Submit enquiry' : 'Continue'}{!pending ? <ArrowRight className="size-5" /> : null}</button></div>
}

const inputClass = 'min-h-12 w-full border border-[#B7D0E3] bg-[#F7F6F3] px-3.5 py-2.5 text-sm text-[#0F1115] outline-none transition focus:border-[#2F5D7C] focus:ring-2 focus:ring-[#2F5D7C]/15'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}{required ? <span className="ml-1 text-[#2F5D7C]">*</span> : <span className="ml-2 text-xs font-normal text-[#3E4B59]">Optional</span>}<span className="mt-2 block">{children}</span></label>
}

function CheckLine({ checked, onChange, required, children }: { checked: boolean; onChange: (checked: boolean) => void; required?: boolean; children: React.ReactNode }) {
  return <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={checked} required={required} onChange={(event) => onChange(event.target.checked)} className="mt-1 size-4 accent-[#2F5D7C]" /><span>{children}{required ? <span className="ml-1 text-[#2F5D7C]">*</span> : null}</span></label>
}

function Summary({ title, rows, onEdit }: { title: string; rows: Array<[string, string]>; onEdit: () => void }) {
  return <section className="border border-[#B7D0E3] bg-[#B7D0E3]/15 p-5"><header className="flex items-center justify-between gap-3 border-b border-[#B7D0E3] pb-3"><h3 className="font-semibold text-[#0B2742]">{title}</h3><button type="button" onClick={onEdit} className="text-xs font-semibold text-[#2F5D7C]">Edit</button></header><dl className="mt-4 space-y-3">{rows.map(([label, value]) => <div key={label}><dt className="text-[0.67rem] font-semibold tracking-[0.1em] text-[#3E4B59] uppercase">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#0B2742]">{value}</dd></div>)}</dl></section>
}

function Success() {
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F7F6F3] px-5 py-16 text-[#0F1115]"><div aria-hidden className="absolute -top-28 -left-28 size-[28rem] rotate-12 bg-[#B7D0E3]/35 [clip-path:polygon(0_0,100%_0,35%_100%,0_70%)]" /><section className="relative w-full max-w-2xl rounded-[1.5rem] border border-[#B7D0E3] bg-[#F7F6F3]/95 px-7 py-14 text-center shadow-[0_25px_80px_-42px_rgba(11,39,66,0.46)] sm:px-14"><span className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#B7D0E3]/45 text-[#2F5D7C]"><CheckCircle2 className="size-8" /></span><div className="mt-8"><HimarkWordmark compact /></div><h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[#0B2742] sm:text-4xl">Thank you for connecting with HIMARK.</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#3E4B59]">We&apos;ve received your enquiry. Our team will review your information and get in touch to discuss the next steps.</p><a href="https://himark.co.za" className="mt-9 inline-flex items-center gap-3 bg-[linear-gradient(100deg,#0B2742,#2F5D7C)] px-7 py-3.5 text-sm font-semibold tracking-[0.14em] text-[#F7F6F3] uppercase">Return to HIMARK<ArrowRight className="size-5" /></a></section></main>
}

function updateDetail<K extends keyof Details>(setter: React.Dispatch<React.SetStateAction<Details>>, key: K, value: Details[K]) {
  setter((current) => ({ ...current, [key]: value }))
}

