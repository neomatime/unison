'use client'

import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { signInAction } from '@/features/auth-ui/actions/sign-in'
import { signInWithMicrosoftAction } from '@/features/auth-ui/actions/sign-in-with-microsoft'

const inputClass = 'h-11 w-full border border-[#cfd8e4] bg-white text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#8795a9] focus:border-[#1769aa] focus:ring-2 focus:ring-[#1769aa]/10 motion-reduce:transition-none'

export function InternalSignInScreen({ next, message }: { next: string; message?: string }) {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [state, formAction, pending] = useActionState(signInAction, undefined)

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fafbfd] text-[#0d2340]">
      <header className="relative z-20 border-b border-[#183457] bg-[#061b3b] text-white">
        <div className="mx-auto flex h-16 max-w-[110rem] items-center justify-between px-6 sm:px-10">
          <Link href="/" className="text-xl font-medium tracking-[0.25em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-2xl">UNISON</Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-200 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none"><ArrowLeft className="size-4" /> Back to site</Link>
        </div>
      </header>

      <InternalBackdrop />

    <section className="relative z-10 flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-5 py-6 sm:px-8">
      <div className="w-full max-w-[38rem] border border-[#d7e0ec] bg-white px-6 py-6 sm:px-12 lg:px-14">
          <p className="text-[0.6875rem] font-medium tracking-[0.19em] text-[#56749a] uppercase">HIMARK Internal</p>
        <h1 className="mt-3 text-3xl leading-tight font-medium tracking-[-0.03em] sm:text-[2rem]">Sign in to UNISON Internal</h1>
        <p className="mt-3 max-w-[31rem] text-sm leading-6 text-[#657590]">Access the HIMARK internal workspace to provision client organisations, configure UNISON tiers, and manage tenant setup.</p>

          {message ? <p role="alert" className="mt-6 border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p> : null}

        <form action={signInWithMicrosoftAction} className="mt-5">
            <input type="hidden" name="next" value={next} />
            <MicrosoftSubmitButton />
          </form>

        <div className="my-4 flex items-center gap-4" aria-hidden="true"><span className="h-px flex-1 bg-[#dce3eb]" /><span className="text-[0.6875rem] font-medium tracking-[0.14em] text-[#657590] uppercase">or sign in with email</span><span className="h-px flex-1 bg-[#dce3eb]" /></div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />

            <div>
              <label htmlFor="internal-email" className="text-sm font-medium">Work email</label>
            <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[#8192aa]" />
                <input id="internal-email" name="email" type="email" required autoComplete="email" placeholder="you@himark.com" className={`${inputClass} pr-4 pl-11`} />
              </div>
            </div>

            <div>
              <label htmlFor="internal-password" className="text-sm font-medium">Password</label>
            <div className="relative mt-1.5">
                <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[#8192aa]" />
                <input id="internal-password" name="password" type={passwordVisible ? 'text' : 'password'} required autoComplete="current-password" className={`${inputClass} pr-12 pl-11`} />
                <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'} className="absolute top-1/2 right-2.5 flex size-9 -translate-y-1/2 items-center justify-center text-[#8192aa] transition-colors duration-150 hover:bg-[#f2f5f8] hover:text-[#0d2340] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1769aa] motion-reduce:transition-none">{passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </div>
            </div>

            <div className="flex justify-end"><Link href="/forgot-password" className="text-sm font-medium text-[#1769aa] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769aa]">Forgot password?</Link></div>

            {state?.error ? <p role="alert" className="border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}

          <button type="submit" disabled={pending} className="flex h-11 w-full items-center justify-center gap-3 bg-[#061b3b] text-sm font-medium text-white transition-colors duration-150 hover:bg-[#0a2a58] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769aa] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none">{pending ? 'Signing in…' : 'Sign in'} <ArrowRight className="size-4" /></button>
          </form>

        <div className="mt-5 flex items-start gap-3 border-t border-[#dce3eb] pt-4 text-xs leading-5 text-[#657590]"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#1769aa]" /><p>Invitation-only access. Provisioning is restricted to authorised HIMARK administrators.</p></div>
        </div>

      <div className="mt-6 flex w-full max-w-[43rem] flex-wrap items-center justify-center gap-y-4 text-sm text-[#657590] max-[800px]:hidden">
          <AccessBenefit icon={ShieldCheck} label="Secure access" />
          <AccessBenefit icon={Building2} label="Tenant provisioning" separated />
          <AccessBenefit icon={Users} label="Role-based administration" separated />
        </div>
      </section>
    </main>
  )
}

function MicrosoftSubmitButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="flex h-11 w-full items-center justify-center gap-3 border border-[#cfd8e4] bg-white text-sm font-medium transition-[background-color,border-color] duration-150 hover:border-[#9fb0c6] hover:bg-[#fafbfd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769aa] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"><MicrosoftMark /> {pending ? 'Connecting…' : 'Continue with Microsoft'}</button>
}

function MicrosoftMark() {
  return <span className="grid size-4 grid-cols-2 gap-[2px]" aria-hidden="true"><span className="bg-[#f25022]" /><span className="bg-[#7fba00]" /><span className="bg-[#00a4ef]" /><span className="bg-[#ffb900]" /></span>
}

function AccessBenefit({ icon: Icon, label, separated = false }: { icon: typeof ShieldCheck; label: string; separated?: boolean }) {
  return <div className={`flex items-center gap-2.5 px-5 ${separated ? 'sm:border-l sm:border-[#cfd8e4]' : ''}`}><Icon className="size-[1.125rem] text-[#1769aa]" /><span>{label}</span></div>
}

function InternalBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-16 bottom-0 overflow-hidden">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" fill="none">
        <g stroke="#d5e2f0" strokeWidth="1" opacity="0.65"><path d="M0 660H520V900M1080 900V640H1600M160 450V780H360M1440 390V740H1230" /><rect x="160" y="550" width="200" height="150" /><rect x="1230" y="500" width="210" height="170" /></g>
        <g fill="#eaf2fa" opacity="0.7"><path d="M0 900V650L390 900H0Z" /><path d="M1600 900V620L1180 900H1600Z" /></g>
      </svg>
    </div>
  )
}
