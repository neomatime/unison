'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { signInAction } from './actions/sign-in'
import { signInWithMicrosoftAction } from './actions/sign-in-with-microsoft'
import { acceptInvitationAction } from '@/features/invitations/actions/accept-invitation'

type AuthKind = 'sign-in' | 'forgot' | 'reset' | 'accept' | 'verify' | 'create-organization' | 'join-organization'
type CompletionMethod = 'email' | null

const copy: Record<AuthKind, { title: string; description: string; action: string }> = {
  'sign-in': { title: 'Welcome back', description: 'Sign in to continue to your HIMARK workspace.', action: 'Sign in' },
  forgot: { title: 'Reset your password', description: 'Enter your work email and we’ll prepare a reset link.', action: 'Continue' },
  reset: { title: 'Choose a new password', description: 'Use a strong password you have not used before.', action: 'Update password' },
  // Deliberately does not name an organization. This used to read "Join HIMARK"
  // for every invitation to every tenant, so a client administrator being
  // onboarded to their own workspace was told they were joining HIMARK — on the
  // first screen they ever see. The real name is passed in as organizationName
  // and overrides this; these strings are the fallback for a token that no
  // longer resolves, where naming any organization would be a guess.
  accept: { title: 'Accept your invitation', description: 'You have been invited to a workspace in UNISON.', action: 'Accept invitation' },
  verify: { title: 'Verify your email', description: 'Check your inbox to finish setting up your UNISON account.', action: 'Resend email' },
  'create-organization': { title: 'Create an organization', description: 'Set up a new tenant workspace for your business.', action: 'Create organization' },
  'join-organization': { title: 'Join an organization', description: 'Enter the invitation code supplied by your administrator.', action: 'Join organization' },
}

export function AuthScreen({ kind, next, token, message, organizationName }: { kind: AuthKind; next?: string; token?: string; message?: string; organizationName?: string }) {
  const [completion, setCompletion] = useState<CompletionMethod>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, undefined)
  const [acceptState, acceptFormAction, acceptPending] = useActionState(acceptInvitationAction, undefined)
  // The invitation names the tenant; the generic copy above is only for when
  // the token no longer resolves and there is nothing truthful to name.
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

  if (isSignIn) {
    return <main className="relative min-h-screen overflow-x-hidden bg-[#f7f9fc] text-[#071c3a]">
      <header className="relative z-20 border-b border-white/10 bg-[#061b3b] text-white shadow-[0_1px_0_rgb(255_255_255_/_0.06)]">
        <div className="mx-auto flex h-[5.25rem] max-w-[110rem] items-center justify-between px-6 sm:px-10">
          <Link href="/" className="rounded-sm text-xl font-bold tracking-[0.25em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-2xl">UNISON</Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-sm text-sm font-semibold text-slate-200 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><ArrowLeft className="size-4" /> Back to site</Link>
        </div>
      </header>

      <MainSignInBackdrop />

      <section className="relative z-10 flex min-h-[calc(100vh-5.25rem)] flex-col items-center justify-center px-5 py-10 sm:px-8 sm:py-12">
        <div className="w-full max-w-[40rem] rounded-2xl border border-[#d5dfec] bg-white/95 px-6 py-9 shadow-[0_18px_60px_rgb(25_55_92_/_0.09)] backdrop-blur-sm sm:px-14 sm:py-11 lg:px-20">
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.15em] text-[#1463df] uppercase">Secure workspace access</p>
            <h1 className="mt-4 text-3xl leading-tight font-bold tracking-[-0.035em] sm:text-[2.5rem]">Sign in to UNISON</h1>
            <p className="mx-auto mt-3 max-w-[30rem] text-sm leading-6 text-slate-600">Access your UNISON workspace to manage projects, governance, and delivery performance.</p>
          </div>

          {message ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{message}</p> : null}

          <MicrosoftSignIn next={next ?? '/overview'} />

          <form action={signInFormAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={next ?? '/overview'} />
            <div>
              <label htmlFor="sign-in-email" className="text-sm font-semibold">Work email</label>
              <div className="relative mt-2">
                <Mail className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-slate-400" />
                <input id="sign-in-email" required autoComplete="email" type="email" name="email" placeholder="you@company.com" className="h-[3.25rem] w-full rounded-lg border border-slate-300 bg-white pr-4 pl-11 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[#1463df] focus:ring-3 focus:ring-blue-100" />
              </div>
            </div>

            <div>
              <label htmlFor="sign-in-password" className="text-sm font-semibold">Password</label>
              <div className="relative mt-2">
                <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-slate-400" />
                <input id="sign-in-password" required autoComplete="current-password" type={passwordVisible ? 'text' : 'password'} name="password" className="h-[3.25rem] w-full rounded-lg border border-slate-300 bg-white pr-12 pl-11 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#1463df] focus:ring-3 focus:ring-blue-100" />
                <button type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} onClick={() => setPasswordVisible((visible) => !visible)} className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1463df]">
                  {passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end"><Link href="/forgot-password" className="rounded-sm text-sm font-semibold text-[#1463df] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1463df]">Forgot password?</Link></div>
            {signInState?.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{signInState.error}</p> : null}
            <button type="submit" disabled={signInPending} className="flex h-[3.5rem] w-full items-center justify-center gap-3 rounded-lg bg-[#061b3b] text-sm font-semibold text-white shadow-[0_8px_22px_rgb(6_27_59_/_0.16)] transition-colors hover:bg-[#0a2a58] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1463df] disabled:cursor-wait disabled:opacity-65">{signInPending ? 'Signing in…' : 'Sign in'}<ArrowRight className="size-4" /></button>
          </form>

          <div className="mt-5 flex items-start gap-3 border-t border-slate-200 pt-5 text-sm leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#1463df]" />
            <p>Invitation-only access. Accounts are provisioned by your UNISON administrator.</p>
          </div>
        </div>

        <div className="mt-8 flex w-full max-w-[47rem] flex-wrap items-center justify-center gap-y-4 text-sm font-medium text-slate-600">
          <SignInBenefit icon={ShieldCheck} title="Enterprise-grade security" />
          <SignInBenefit icon={LockKeyhole} title="SSO-ready" separated />
          <SignInBenefit icon={Users} title="Role-based access" separated />
        </div>
      </section>
    </main>
  }

  return <main className="grid min-h-screen bg-background lg:grid-cols-2">
    <BrandPanel />

    <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-between lg:hidden">
          <Link href="/" className="text-lg font-bold tracking-[0.2em]">UNISON</Link>
          <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground"><Image src="/brand/himark-mark.png" alt="" width={28} height={28} className="rounded-md" />HIMARK</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{content.description}</p>

        {completion ? <CompletionState kind={kind} /> : <>
          <form
            action={isAccept ? acceptFormAction : undefined}
            onSubmit={isAccept ? undefined : (event) => { event.preventDefault(); setCompletion('email') }}
            className="mt-8 space-y-4"
          >
            {isAccept ? <input type="hidden" name="token" value={token ?? ''} /> : null}
            {isAccept ? null : organization ? <label className="block text-sm font-medium">Organization name or code<input required defaultValue={kind === 'create-organization' ? 'HIMARK' : ''} className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15" /></label> : <label className="block text-sm font-medium">Work email<div className="relative mt-1.5"><Mail className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" defaultValue="" className="h-12 w-full rounded-xl border border-border bg-card pr-3 pl-10 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15" /></div></label>}
            {usesPassword ? <label className="block text-sm font-medium">Password<input required type="password" className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15" /></label> : null}
            {isAccept && acceptState?.error ? <p role="alert" className="text-sm text-destructive">{acceptState.error}</p> : null}
            <button type="submit" disabled={isAccept && acceptPending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">{content.action}<ArrowRight className="size-4" /></button>
          </form>
        </>}
      </div>
    </section>
  </main>
}

function SignInBenefit({ icon: Icon, title, separated = false }: { icon: typeof ShieldCheck; title: string; separated?: boolean }) {
  return <div className={`flex items-center gap-3 px-5 ${separated ? 'sm:border-l sm:border-slate-300' : ''}`}>
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#edf4ff] text-[#1463df]"><Icon className="size-[1.125rem]" /></span>
    <span>{title}</span>
  </div>
}

function MainSignInBackdrop() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[5.25rem] bottom-0 overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,white_0%,rgba(247,249,252,0.82)_58%,rgba(243,247,252,0.96)_100%)]" />
    <svg viewBox="0 0 1536 946" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 hidden size-full lg:block" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#c8daef" strokeWidth="1.1" opacity="0.7">
        <path d="M43 245H352M101 145V805M200 96V813M43 478H398M101 363H268V670H350" />
        <path d="M200 245A150 150 0 0 1 350 95" />
        <path d="M200 478A203 203 0 0 1 403 681V727A129 129 0 0 1 274 856H200" />
        <rect x="101" y="310" width="99" height="120" />
        <rect x="200" y="310" width="68" height="74" />
        <rect x="200" y="670" width="68" height="74" />

        <path d="M1138 165V784M1190 246H1495M1283 95V808M1078 452H1495M1189 582H1495" />
        <path d="M1477 452A274 274 0 0 1 1203 726" />
        <rect x="1283" y="164" width="95" height="116" />
        <rect x="1325" y="197" width="52" height="68" />
        <path d="M1138 246H1283V452H1189V582H1078" />
        <path d="M1189 582V728L1283 670V452" />
      </g>

      <g stroke="#a9c7eb" strokeWidth="1.4" opacity="0.75">
        <path d="M160 447V502C160 529 177 552 200 566C223 552 240 529 240 502V447L200 430L160 447Z" />
        <path d="M190 497L198 505L213 487" stroke="#5d9ef0" strokeWidth="2" />
      </g>

      <g fill="#b9d2ef" opacity="0.68">
        <circle cx="200" cy="245" r="3" fill="#1463df" />
        <circle cx="350" cy="95" r="3" />
        <circle cx="1283" cy="452" r="3" fill="#1463df" />
        <circle cx="1377" cy="197" r="3" fill="#1463df" />
        {Array.from({ length: 5 }).map((_, row) => Array.from({ length: 4 }).map((__, column) => <circle key={`left-${row}-${column}`} cx={205 + column * 12} cy={258 + row * 12} r="1.5" />))}
        {Array.from({ length: 5 }).map((_, row) => Array.from({ length: 4 }).map((__, column) => <circle key={`right-${row}-${column}`} cx={1382 + column * 12} cy={105 + row * 12} r="1.5" />))}
        {Array.from({ length: 5 }).map((_, row) => Array.from({ length: 4 }).map((__, column) => <circle key={`right-low-${row}-${column}`} cx={1218 + column * 12} cy={463 + row * 12} r="1.5" />))}
      </g>
    </svg>
    <div className="absolute inset-x-[4%] bottom-0 h-40 bg-[radial-gradient(circle,#c5d9f1_1px,transparent_1.2px)] bg-[size:13px_13px] opacity-30 [mask-image:linear-gradient(to_top,black,transparent)] lg:hidden" />
  </div>
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

function MicrosoftSignIn({ next }: { next: string }) {
  return <div className="mt-8">
    <form action={signInWithMicrosoftAction}>
      <input type="hidden" name="next" value={next} />
      <MicrosoftSignInButton />
    </form>
    <div className="mt-6 flex items-center gap-4"><span className="h-px flex-1 bg-slate-200" /><span className="text-[0.6875rem] font-semibold tracking-wide text-slate-500 uppercase">or sign in with email</span><span className="h-px flex-1 bg-slate-200" /></div>
  </div>
}

function MicrosoftSignInButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="flex h-[3.5rem] w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1463df] disabled:cursor-wait disabled:opacity-65"><MicrosoftMark />{pending ? 'Connecting…' : 'Continue with Microsoft'}</button>
}

function MicrosoftMark() {
  return <span className="grid size-4 grid-cols-2 gap-[2px]" aria-hidden="true"><span className="bg-[#f25022]" /><span className="bg-[#7fba00]" /><span className="bg-[#00a4ef]" /><span className="bg-[#ffb900]" /></span>
}

function CompletionState({ kind }: { kind: AuthKind }) {
  const signIn = kind === 'sign-in'
  return <div className="mt-8 rounded-xl border border-brand/30 bg-brand-soft p-5">
    <CheckCircle2 className="size-5 text-brand" />
    <h2 className="mt-3 font-semibold">{signIn ? 'Sign-in ready' : 'Action complete'}</h2>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">Follow the confirmation instructions to continue securely.</p>
    <Link href="/overview" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">Continue to UNISON <ArrowRight className="size-4" /></Link>
  </div>
}
