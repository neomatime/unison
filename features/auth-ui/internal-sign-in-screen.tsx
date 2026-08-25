'use client'

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { signInAction } from '@/features/auth-ui/actions/sign-in'
import { signInWithMicrosoftAction } from '@/features/auth-ui/actions/sign-in-with-microsoft'

export function InternalSignInScreen({ next, message }: { next: string; message?: string }) {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [state, formAction, pending] = useActionState(signInAction, undefined)

  return <main className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-[#071c3a]">
    <header className="relative z-20 border-b border-white/10 bg-[#061b3b] text-white shadow-[0_1px_0_rgb(255_255_255_/_0.06)]">
      <div className="mx-auto flex h-[5.25rem] max-w-[110rem] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="text-xl font-bold tracking-[0.25em] sm:text-2xl">UNISON</Link>
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 transition-colors hover:text-white">
          <ArrowLeft className="size-4" /> Back to site
        </Link>
      </div>
    </header>

    <InternalBackdrop />

    <section className="relative z-10 flex min-h-[calc(100vh-5.25rem)] flex-col items-center justify-center px-5 py-10 sm:px-8 sm:py-12">
      <div className="w-full max-w-[40rem] rounded-2xl border border-[#d7e0ec] bg-white/95 px-6 py-8 shadow-[0_18px_60px_rgb(25_55_92_/_0.09)] backdrop-blur sm:px-12 sm:py-10 lg:px-[4.5rem]">
        <p className="text-xs font-bold tracking-[0.15em] text-[#1463df] uppercase">HIMARK Internal</p>
        <h1 className="mt-3 text-3xl leading-tight font-bold tracking-[-0.035em] sm:text-[2.25rem]">Sign in to UNISON Internal</h1>
        <p className="mt-3 max-w-[31rem] text-sm leading-6 text-slate-600">
          Access the HIMARK internal workspace to provision client organisations, configure UNISON tiers, and manage tenant setup.
        </p>

        {message ? <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{message}</p> : null}

        <form action={signInWithMicrosoftAction} className="mt-7">
          <input type="hidden" name="next" value={next} />
          <MicrosoftSubmitButton />
        </form>

        <div className="my-6 flex items-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[0.6875rem] font-semibold tracking-wide text-slate-500 uppercase">or sign in with email</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div>
            <label htmlFor="internal-email" className="text-sm font-semibold">Work email</label>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-slate-400" />
              <input
                id="internal-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@himark.com"
                className="h-[3.25rem] w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[#1463df] focus:ring-3 focus:ring-blue-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="internal-password" className="text-sm font-semibold">Password</label>
            <div className="relative mt-2">
              <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-slate-400" />
              <input
                id="internal-password"
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="h-[3.25rem] w-full rounded-lg border border-slate-300 bg-white pr-12 pl-11 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#1463df] focus:ring-3 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1463df]"
              >
                {passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm font-semibold text-[#1463df] hover:underline">Forgot password?</Link>
          </div>

          {state?.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{state.error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="flex h-[3.25rem] w-full items-center justify-center gap-3 rounded-lg bg-[#061b3b] text-sm font-semibold text-white shadow-[0_8px_22px_rgb(6_27_59_/_0.16)] transition-colors hover:bg-[#0a2a58] disabled:cursor-wait disabled:opacity-65"
          >
            {pending ? 'Signing in…' : 'Sign in'} <ArrowRight className="size-4" />
          </button>
        </form>

        <div className="mt-6 flex items-start gap-3 border-t border-slate-200 pt-5 text-sm leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#1463df]" />
          <p>Invitation-only access. Provisioning is restricted to authorised HIMARK administrators.</p>
        </div>
      </div>

      <div className="mt-8 flex w-full max-w-[43rem] flex-wrap items-center justify-center gap-y-4 text-sm font-medium text-slate-600">
        <AccessBenefit icon={ShieldCheck} label="Secure access" />
        <AccessBenefit icon={Building2} label="Tenant provisioning" separated />
        <AccessBenefit icon={Users} label="Role-based administration" separated />
      </div>
    </section>
  </main>
}

function MicrosoftSubmitButton() {
  const { pending } = useFormStatus()
  return <button
    type="submit"
    disabled={pending}
    className="flex h-[3.25rem] w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-65"
  >
    <MicrosoftMark /> {pending ? 'Connecting…' : 'Continue with Microsoft'}
  </button>
}

function MicrosoftMark() {
  return <span className="grid size-4 grid-cols-2 gap-[2px]" aria-hidden="true">
    <span className="bg-[#f25022]" /><span className="bg-[#7fba00]" />
    <span className="bg-[#00a4ef]" /><span className="bg-[#ffb900]" />
  </span>
}

function AccessBenefit({ icon: Icon, label, separated = false }: { icon: typeof ShieldCheck; label: string; separated?: boolean }) {
  return <div className={`flex items-center gap-2.5 px-5 ${separated ? 'sm:border-l sm:border-slate-300' : ''}`}>
    <Icon className="size-[1.125rem] text-[#1463df]" />
    <span>{label}</span>
  </div>
}

function InternalBackdrop() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[5.25rem] bottom-0 overflow-hidden">
    <div className="absolute -bottom-[35rem] -left-[21rem] h-[58rem] w-[76rem] rounded-[50%] border border-blue-100/80" />
    <div className="absolute -right-[19rem] -bottom-[31rem] h-[55rem] w-[70rem] rounded-[50%] border border-slate-200/90" />
    <div className="absolute inset-x-[6%] bottom-0 h-[17rem] bg-[radial-gradient(circle,#bdd1ed_1px,transparent_1.25px)] bg-[size:12px_12px] opacity-45 [mask-image:linear-gradient(to_top,black,transparent)]" />
    <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(to_top,rgba(226,235,247,0.45),transparent)]" />
  </div>
}

