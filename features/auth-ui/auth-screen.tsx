'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Mail } from 'lucide-react'
import { useActionState, useState } from 'react'
import { signInAction } from './actions/sign-in'
import { signInWithMicrosoftAction } from './actions/sign-in-with-microsoft'
import { acceptInvitationAction } from '@/features/invitations/actions/accept-invitation'

type AuthKind = 'sign-in' | 'forgot' | 'reset' | 'accept' | 'verify' | 'create-organization' | 'join-organization'
type CompletionMethod = 'email' | null

const copy: Record<AuthKind, { title: string; description: string; action: string }> = {
  'sign-in': { title: 'Welcome back', description: 'Sign in to continue to your HIMARK workspace.', action: 'Sign in' },
  forgot: { title: 'Reset your password', description: 'Enter your work email and we’ll prepare a reset link.', action: 'Continue' },
  reset: { title: 'Choose a new password', description: 'Use a strong password you have not used before.', action: 'Update password' },
  accept: { title: 'Join HIMARK', description: 'You have been invited to the HIMARK organization in UNISON.', action: 'Accept invitation' },
  verify: { title: 'Verify your email', description: 'Check your inbox to finish setting up your UNISON account.', action: 'Resend email' },
  'create-organization': { title: 'Create an organization', description: 'Set up a new tenant workspace for your business.', action: 'Create organization' },
  'join-organization': { title: 'Join an organization', description: 'Enter the invitation code supplied by your administrator.', action: 'Join organization' },
}

export function AuthScreen({ kind, next, token, message }: { kind: AuthKind; next?: string; token?: string; message?: string }) {
  const [completion, setCompletion] = useState<CompletionMethod>(null)
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, undefined)
  const [acceptState, acceptFormAction, acceptPending] = useActionState(acceptInvitationAction, undefined)
  const content = copy[kind]
  const showPassword = ['sign-in', 'reset'].includes(kind)
  const organization = ['create-organization', 'join-organization'].includes(kind)
  const isSignIn = kind === 'sign-in'
  const isAccept = kind === 'accept'

  return <main className="grid min-h-screen bg-background lg:grid-cols-2">
    <BrandPanel />

    <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-between lg:hidden">
          <Link href="/overview" className="text-lg font-bold tracking-[0.2em]">UNISON</Link>
          <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground"><Image src="/brand/himark-mark.png" alt="" width={28} height={28} className="rounded-md" />HIMARK</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{kind === 'sign-in' ? 'Sign in to your HIMARK workspace.' : content.description}</p>

        {isSignIn && message ? <p role="alert" className="mt-6 text-sm text-destructive">{message}</p> : null}

        {completion ? <CompletionState kind={kind} /> : <>
          {kind === 'sign-in' ? <MicrosoftSignIn /> : null}

          <form
            action={isSignIn ? signInFormAction : isAccept ? acceptFormAction : undefined}
            onSubmit={isSignIn || isAccept ? undefined : (event) => { event.preventDefault(); setCompletion('email') }}
            className={kind === 'sign-in' ? 'mt-6 space-y-4' : 'mt-8 space-y-4'}
          >
            {isSignIn ? <input type="hidden" name="next" value={next ?? '/overview'} /> : null}
            {isAccept ? <input type="hidden" name="token" value={token ?? ''} /> : null}
            {isAccept ? null : organization ? <label className="block text-sm font-medium">Organization name or code<input required defaultValue={kind === 'create-organization' ? 'HIMARK' : ''} className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15" /></label> : <label className="block text-sm font-medium">Work email<div className="relative mt-1.5"><Mail className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" name={isSignIn ? 'email' : undefined} defaultValue="" className="h-12 w-full rounded-xl border border-border bg-card pr-3 pl-10 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15" /></div></label>}
            {showPassword ? <label className="block text-sm font-medium">Password<input required type="password" name={isSignIn ? 'password' : undefined} className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15" /></label> : null}
            {kind === 'sign-in' ? <div className="flex justify-end"><Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">Forgot password?</Link></div> : null}
            {isSignIn && signInState?.error ? <p role="alert" className="text-sm text-destructive">{signInState.error}</p> : null}
            {isAccept && acceptState?.error ? <p role="alert" className="text-sm text-destructive">{acceptState.error}</p> : null}
            <button type="submit" disabled={(isSignIn && signInPending) || (isAccept && acceptPending)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">{content.action}<ArrowRight className="size-4" /></button>
          </form>

          {kind === 'sign-in' ? <p className="mt-6 text-center text-xs text-muted-foreground">Invitation-only access.</p> : null}
        </>}
      </div>
    </section>
  </main>
}

// Exported so the invitation signup screen can share the exact same left-hand
// panel without either duplicating it or adding a further branch to the
// already heavily-conditional component above.
export function BrandPanel() {
  return <section className="relative hidden min-h-screen overflow-hidden bg-sidebar p-12 text-sidebar-active-foreground lg:flex lg:flex-col">
    <div aria-hidden="true" className="absolute inset-0">
      <Image src="/brand/himark-login-background.png" alt="" fill priority sizes="50vw" className="scale-[1.01] object-cover object-center" />
      <div className="absolute inset-0 bg-[#06121d]/20" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(4,12,20,0.5),rgba(4,12,20,0.08)_42%,rgba(4,12,20,0.58))]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(4,12,20,0.28),transparent_35%,transparent_65%,rgba(4,12,20,0.28))]" />
    </div>

    <span className="relative z-10 text-xl font-bold tracking-[0.2em] drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)]">UNISON</span>

    <div className="relative z-10 flex flex-1 flex-col items-center justify-center pb-12">
      <div className="flex flex-col items-center rounded-[1.75rem] border border-white/15 bg-[#07131e]/50 px-9 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-md">
        <HimarkMark className="h-32 w-20 text-white/90" />
        <p className="mt-5 text-[0.625rem] font-semibold tracking-[0.3em] text-white/65">HIMARK</p>
      </div>
    </div>
  </section>
}

function HimarkMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 360 600" role="img" aria-label="HIMARK logo" className={className}>
    <rect x="5" y="5" width="350" height="590" fill="none" stroke="currentColor" strokeWidth="10" />
    <path fill="currentColor" d="M20 20h120v220h30v120h-30v220H20V20Z" />
    <path fill="currentColor" d="M340 20H220v220h-30v120h30v220h120V20Z" />
  </svg>
}

function MicrosoftSignIn() {
  return <div className="mt-8">
    <form action={signInWithMicrosoftAction}>
      <button type="submit" className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm font-semibold shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] transition-colors hover:bg-muted/50"><MicrosoftMark />Continue with Microsoft</button>
    </form>
    <div className="mt-6 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">or sign in with email</span><span className="h-px flex-1 bg-border" /></div>
  </div>
}

function MicrosoftMark() {
  return <span className="grid size-4 grid-cols-2 gap-[2px]" aria-hidden="true"><span className="bg-[#f25022]" /><span className="bg-[#7fba00]" /><span className="bg-[#00a4ef]" /><span className="bg-[#ffb900]" /></span>
}

function CompletionState({ kind }: { kind: AuthKind }) {
  const signIn = kind === 'sign-in'
  return <div className="mt-8 rounded-xl border border-brand/30 bg-brand-soft p-5">
    <CheckCircle2 className="size-5 text-brand" />
    <h2 className="mt-3 font-semibold">{signIn ? 'Sign-in ready' : 'Demo action complete'}</h2>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">No authentication or invitation was sent. This interaction currently uses local UI state.</p>
    <Link href="/overview" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">Continue to UNISON <ArrowRight className="size-4" /></Link>
  </div>
}
