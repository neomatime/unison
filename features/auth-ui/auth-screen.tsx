'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { acceptInvitationAction } from '@/features/invitations/actions/accept-invitation'

import { signInAction } from './actions/sign-in'
import { signInWithMicrosoftAction } from './actions/sign-in-with-microsoft'
import {
  requestPasswordResetAction,
  resendVerificationAction,
  updatePasswordAction,
} from './actions/account-access'

type AuthKind = 'sign-in' | 'forgot' | 'reset' | 'accept' | 'verify' | 'create-organization' | 'join-organization'
type CompletionMethod = 'email' | null

const copy: Record<AuthKind, { title: string; description: string; action: string }> = {
  'sign-in': { title: 'Sign in', description: 'Access the operating layer for governed enterprise delivery.', action: 'Sign in' },
  forgot: { title: 'Reset your password', description: 'Enter your work email and we’ll prepare a reset link.', action: 'Continue' },
  reset: { title: 'Choose a new password', description: 'Use a strong password you have not used before.', action: 'Update password' },
  // The invitation names the tenant when it can be resolved. These generic
  // strings remain truthful for expired or otherwise unresolved invitations.
  accept: { title: 'Accept your invitation', description: 'You have been invited to a workspace in UNISON.', action: 'Accept invitation' },
  verify: { title: 'Verify your email', description: 'Check your inbox to finish setting up your UNISON account.', action: 'Resend email' },
  'create-organization': { title: 'Create an organization', description: 'Set up a new tenant workspace for your business.', action: 'Create organization' },
  'join-organization': { title: 'Join an organization', description: 'Enter the invitation code supplied by your administrator.', action: 'Join organization' },
}

const controlClass = 'h-12 w-full border border-[#cfd8e4] bg-white text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#8392a8] focus:border-[#1769aa] focus:ring-2 focus:ring-[#1769aa]/10 motion-reduce:transition-none'

export function AuthScreen({ kind, next, token, message, organizationName }: { kind: AuthKind; next?: string; token?: string; message?: string; organizationName?: string }) {
  const [completion, setCompletion] = useState<CompletionMethod>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, undefined)
  const [acceptState, acceptFormAction, acceptPending] = useActionState(acceptInvitationAction, undefined)
  const [recoveryState, recoveryAction, recoveryPending] = useActionState(requestPasswordResetAction, undefined)
  const [resetState, resetAction, resetPending] = useActionState(updatePasswordAction, undefined)
  const [verificationState, verificationAction, verificationPending] = useActionState(resendVerificationAction, undefined)
  const content = kind === 'accept' && organizationName
    ? {
        ...copy.accept,
        title: `Join ${organizationName}`,
        description: `You have been invited to the ${organizationName} organization in UNISON.`,
      }
    : copy[kind]
  const usesPassword = ['sign-in', 'reset'].includes(kind)
  const organization = ['create-organization', 'join-organization'].includes(kind)
  const isSignIn = kind === 'sign-in'
  const isAccept = kind === 'accept'
  const isForgot = kind === 'forgot'
  const isReset = kind === 'reset'
  const isVerify = kind === 'verify'
  const accountAccessComplete = recoveryState?.sent || resetState?.updated || verificationState?.sent
  const accountAccessError = recoveryState?.error || resetState?.error || verificationState?.error
  const accountAccessPending = recoveryPending || resetPending || verificationPending
  const accountAccessAction = isForgot ? recoveryAction : isReset ? resetAction : isVerify ? verificationAction : undefined

  if (isSignIn) {
    return (
      <main className="grid min-h-screen bg-[#fafbfd] text-[#0d2340] lg:grid-cols-[1.12fr_0.88fr]">
        <SignInBrandPanel />

        <section className="relative flex min-h-screen flex-col border-l border-[#dce3eb] bg-white">
          <div className="flex h-16 items-center justify-between border-b border-[#edf0f4] px-6 sm:px-10 lg:border-b-0 lg:px-12">
            <Link href="/" className="text-lg font-medium tracking-[0.24em] lg:hidden">UNISON</Link>
            <Link href="/" className="ml-auto inline-flex items-center gap-2 text-sm font-medium text-[#51647e] transition-colors duration-150 ease-out hover:text-[#0d2340] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1769aa] motion-reduce:transition-none">
              <ArrowLeft className="size-4" /> Back to site
            </Link>
          </div>

          <div className="flex flex-1 items-center px-6 py-7 sm:px-10 lg:px-[clamp(3rem,7vw,7rem)] lg:py-8">
            <div className="w-full max-w-[36.5rem]">
              <p className="text-[0.6875rem] font-medium tracking-[0.22em] text-[#56749a] uppercase">Welcome to UNISON</p>
              <h1 className="mt-3 text-[2.65rem] leading-none font-medium tracking-[-0.035em] sm:text-[3rem]">Sign in</h1>
              <p className="mt-3 max-w-[26rem] text-sm leading-6 text-[#657590]">Access the operating layer for governed enterprise delivery.</p>

              {message ? <p role="alert" className="mt-7 border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p> : null}

              <MicrosoftSignIn next={next ?? '/overview'} />

              <form action={signInFormAction} className="mt-5 space-y-3">
                <input type="hidden" name="next" value={next ?? '/overview'} />
                <div>
                  <label htmlFor="sign-in-email" className="text-sm font-medium">Work email</label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[#8192aa]" />
                    <input id="sign-in-email" required autoComplete="email" type="email" name="email" placeholder="you@company.com" className={`${controlClass} pr-4 pl-11`} />
                  </div>
                </div>

                <div>
                  <label htmlFor="sign-in-password" className="text-sm font-medium">Password</label>
                  <div className="relative mt-1.5">
                    <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[#8192aa]" />
                    <input id="sign-in-password" required autoComplete="current-password" type={passwordVisible ? 'text' : 'password'} name="password" className={`${controlClass} pr-12 pl-11`} />
                    <button type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} onClick={() => setPasswordVisible((visible) => !visible)} className="absolute top-1/2 right-2.5 flex size-9 -translate-y-1/2 items-center justify-center text-[#8192aa] transition-colors duration-150 hover:bg-[#f2f5f8] hover:text-[#0d2340] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1769aa] motion-reduce:transition-none">
                      {passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm font-medium text-[#1769aa] transition-colors duration-150 hover:text-[#0f4c7d] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769aa] motion-reduce:transition-none">Forgot password?</Link>
                </div>

                {signInState?.error ? <p role="alert" className="border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">{signInState.error}</p> : null}

                <button type="submit" disabled={signInPending} className="flex h-12 w-full items-center justify-center gap-4 bg-[#1769aa] text-xs font-medium tracking-[0.18em] text-white uppercase transition-colors duration-150 ease-out hover:bg-[#125486] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d2340] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none">
                  {signInPending ? 'Signing in…' : 'Sign in'} <ArrowRight className="size-4" />
                </button>
              </form>

              <div className="mt-5 flex items-start gap-4 border-t border-[#dce3eb] pt-4 text-xs leading-5 text-[#657590]">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#1769aa]" />
                <span aria-hidden="true" className="h-10 w-px shrink-0 bg-[#dce3eb]" />
                <p>Invitation-only access. Accounts are provisioned by your UNISON administrator.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <BrandPanel />

      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Link href="/" className="text-lg font-medium tracking-[0.2em]">UNISON</Link>
            <span className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-muted-foreground"><Image src="/brand/himark-mark.png" alt="" width={28} height={28} />HIMARK</span>
          </div>

          <h1 className="text-3xl font-medium tracking-[-0.025em]">{content.title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{content.description}</p>

          {completion || accountAccessComplete ? <CompletionState kind={kind} /> : (
            <form
              action={isAccept ? acceptFormAction : accountAccessAction}
              onSubmit={isAccept || accountAccessAction ? undefined : (event) => { event.preventDefault(); setCompletion('email') }}
              className="mt-8 space-y-5"
            >
              {isAccept ? <input type="hidden" name="token" value={token ?? ''} /> : null}
              {isAccept ? null : organization ? (
                <label className="block text-sm font-medium">Organization name or code<input required defaultValue={kind === 'create-organization' ? 'HIMARK' : ''} className="mt-2 h-12 w-full border border-border bg-card px-3 outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/15 motion-reduce:transition-none" /></label>
              ) : (
                <label className="block text-sm font-medium">Work email<div className="relative mt-2"><Mail className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" name="email" autoComplete="email" defaultValue="" className="h-12 w-full border border-border bg-card pr-3 pl-10 outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/15 motion-reduce:transition-none" /></div></label>
              )}
              {usesPassword ? <label className="block text-sm font-medium">Password<input required type="password" name="password" autoComplete={isReset ? 'new-password' : 'current-password'} className="mt-2 h-12 w-full border border-border bg-card px-3 outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/15 motion-reduce:transition-none" /></label> : null}
              {isReset ? <label className="block text-sm font-medium">Confirm password<input required type="password" name="confirmPassword" autoComplete="new-password" className="mt-2 h-12 w-full border border-border bg-card px-3 outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/15 motion-reduce:transition-none" /></label> : null}
              {isAccept && acceptState?.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">{acceptState.error}</p> : null}
              {accountAccessError ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">{accountAccessError}</p> : null}
              <button type="submit" disabled={(isAccept && acceptPending) || accountAccessPending} className="flex h-12 w-full items-center justify-center gap-2 bg-foreground text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none">{accountAccessPending ? 'Working…' : content.action}<ArrowRight className="size-4" /></button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}

function SignInBrandPanel() {
  const principles = ['Structure', 'Own', 'Progress', 'Detect', 'Intervene', 'Govern', 'Communicate']

  return (
    <section className="relative hidden min-h-screen overflow-hidden bg-[#f7fafe] lg:flex lg:flex-col">
      <svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none">
        <path d="M730 236 1000 64V1000H730V236Z" fill="#e1edf9" />
        <path d="M730 236 1000 64V574L730 707V236Z" fill="#d5e6f7" />
        <path d="M0 1000 730 707V1000H0Z" fill="#edf4fb" />
        <path d="M730 0V1000M876 0V1000" stroke="#9db9d7" strokeWidth="1" />
        <path d="M678 382V777" stroke="#b4c8df" strokeWidth="1" />
      </svg>

      <div className="relative z-10 flex min-h-screen flex-col px-[clamp(3.5rem,6vw,7rem)] py-[clamp(3rem,6vw,5rem)]">
        <Link href="/" className="self-start text-[1.75rem] font-medium tracking-[0.28em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1769aa]">UNISON</Link>

        <div className="my-auto max-w-[35rem] py-16">
          <span className="block h-0.5 w-9 bg-[#1769aa]" />
          <p className="mt-7 max-w-[22rem] text-[0.6875rem] leading-5 font-medium tracking-[0.2em] text-[#5e7290] uppercase">The operating layer for governed enterprise delivery.</p>
          <h2 className="mt-14 text-[clamp(3.25rem,5vw,5.35rem)] leading-[0.99] font-medium tracking-[-0.045em] text-[#0d2340]">Aligned delivery.<br />Greater impact.</h2>
          <p className="mt-8 max-w-[31rem] text-lg leading-8 text-[#657590]">One workspace. Complete visibility.<br />From strategy to outcomes.</p>
        </div>

        <div>
          <span className="block h-0.5 w-10 bg-[#1769aa]" />
          <div className="mt-7 flex flex-nowrap items-center text-[0.5rem] font-medium tracking-[0.08em] text-[#5e7290] uppercase">
            {principles.map((principle, index) => <span key={principle} className="flex items-center whitespace-nowrap"><span>{principle}</span>{index < principles.length - 1 ? <span aria-hidden="true" className="mx-3 h-4 w-px bg-[#b8c6d7]" /> : null}</span>)}
          </div>
        </div>
      </div>
    </section>
  )
}

// Exported so the invitation signup screen can share the same branded panel.
export function BrandPanel() {
  return (
    <section className="relative hidden min-h-screen overflow-hidden bg-sidebar p-12 text-sidebar-active-foreground lg:flex lg:flex-col">
      <div aria-hidden="true" className="absolute inset-0">
        <Image src="/brand/himark-login-background.png" alt="" fill priority sizes="50vw" className="scale-[1.01] object-cover object-center" />
        <div className="absolute inset-0 bg-[#06121d]/30" />
      </div>

      <span className="relative z-10 text-xl font-medium tracking-[0.22em]">UNISON</span>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center pb-12">
        <div className="flex flex-col items-center border border-white/20 bg-[#07131e]/58 px-10 py-9">
          <HimarkMark className="h-32 w-20 text-white/90" />
          <p className="mt-5 text-[0.625rem] font-medium tracking-[0.3em] text-white/70">HIMARK</p>
        </div>
      </div>
    </section>
  )
}

function HimarkMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 360 600" role="img" aria-label="HIMARK logo" className={className}><rect x="5" y="5" width="350" height="590" fill="none" stroke="currentColor" strokeWidth="10" /><path fill="currentColor" d="M20 20h120v220h30v120h-30v220H20V20Z" /><path fill="currentColor" d="M340 20H220v220h-30v120h30v220h120V20Z" /></svg>
}

function MicrosoftSignIn({ next }: { next: string }) {
  return (
    <div className="mt-6">
      <form action={signInWithMicrosoftAction}>
        <input type="hidden" name="next" value={next} />
        <MicrosoftSignInButton />
      </form>
      <div className="mt-5 flex items-center gap-5"><span className="h-px flex-1 bg-[#dce3eb]" /><span className="text-[0.6875rem] font-medium tracking-[0.14em] text-[#657590] uppercase">or</span><span className="h-px flex-1 bg-[#dce3eb]" /></div>
    </div>
  )
}

function MicrosoftSignInButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-3 border border-[#cfd8e4] bg-white text-sm font-medium transition-[background-color,border-color] duration-150 ease-out hover:border-[#9fb0c6] hover:bg-[#fafbfd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769aa] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"><MicrosoftMark />{pending ? 'Connecting…' : 'Continue with Microsoft'}</button>
}

function MicrosoftMark() {
  return <span className="grid size-4 grid-cols-2 gap-[2px]" aria-hidden="true"><span className="bg-[#f25022]" /><span className="bg-[#7fba00]" /><span className="bg-[#00a4ef]" /><span className="bg-[#ffb900]" /></span>
}

function CompletionState({ kind }: { kind: AuthKind }) {
  const content = kind === 'forgot'
    ? { title: 'Check your email', description: 'If an account matches that address, a password reset link is on its way.', href: '/sign-in', link: 'Return to sign in' }
    : kind === 'reset'
      ? { title: 'Password updated', description: 'Your recovery session has ended. Sign in with your new password to continue.', href: '/sign-in', link: 'Sign in' }
      : kind === 'verify'
        ? { title: 'Check your email', description: 'If the address is awaiting confirmation, a new verification link is on its way.', href: '/sign-in', link: 'Return to sign in' }
        : { title: 'Action complete', description: 'Follow the confirmation instructions to continue securely.', href: '/overview', link: 'Continue to UNISON' }
  return (
    <div className="mt-8 border-l-2 border-brand bg-brand-soft p-5">
      <CheckCircle2 className="size-5 text-brand" />
      <h2 className="mt-3 font-medium">{content.title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{content.description}</p>
      <Link href={content.href} className="mt-5 inline-flex items-center gap-2 text-sm font-medium">{content.link} <ArrowRight className="size-4" /></Link>
    </div>
  )
}
