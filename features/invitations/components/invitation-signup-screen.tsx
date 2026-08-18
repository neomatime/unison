'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useActionState } from 'react'
import { BrandPanel } from '@/features/auth-ui/auth-screen'
import { signUpFromInvitationAction } from '../actions/sign-up-from-invitation'
import { MIN_PASSWORD_LENGTH } from '../schemas/signup'

/**
 * Shown when someone arrives on an invitation link with no account yet.
 *
 * A separate component rather than another `kind` on AuthScreen: that one is
 * already a dense stack of isSignIn/isAccept ternaries, and a fourth branch
 * would make it harder to reason about the auth surface — which is the last
 * place that should be hard to reason about. The brand panel is shared, so
 * nothing is duplicated visually.
 */
export function InvitationSignUpScreen({
  token,
  email,
  organizationName,
}: {
  token: string
  email: string
  organizationName: string
}) {
  const [state, formAction, pending] = useActionState(signUpFromInvitationAction, undefined)

  return <main className="grid min-h-screen bg-background lg:grid-cols-2">
    <BrandPanel />

    <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-between lg:hidden">
          <span className="text-lg font-bold tracking-[0.2em]">UNISON</span>
          <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground"><Image src="/brand/himark-mark.png" alt="" width={28} height={28} className="rounded-md" />HIMARK</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Join {organizationName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose a password to finish setting up your account.</p>

        <form action={formAction} className="mt-8 space-y-4">
          <input type="hidden" name="token" value={token} />

          {/* The address is fixed by the invitation and re-read from it on the
              server. Shown disabled so it is obvious which account is being
              created, and never submitted — a changed value would be ignored. */}
          <label className="block text-sm font-medium">
            Work email
            <input
              type="email"
              value={email}
              disabled
              readOnly
              className="mt-1.5 h-12 w-full rounded-xl border border-border bg-muted/50 px-3 text-muted-foreground outline-none"
            />
          </label>

          <label className="block text-sm font-medium">
            Password
            <input
              required
              type="password"
              name="password"
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15"
            />
            <span className="mt-1.5 block text-xs font-normal text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</span>
          </label>

          <label className="block text-sm font-medium">
            Confirm password
            <input
              required
              type="password"
              name="confirmPassword"
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15"
            />
          </label>

          {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
          >
            {pending ? 'Creating your account…' : 'Create account and join'}
            <ArrowRight className="size-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link href={`/sign-in?next=${encodeURIComponent(`/accept-invitation?token=${token}`)}`} className="font-semibold text-foreground hover:underline">
            Sign in
          </Link>{' '}
          and this invitation will still be waiting.
        </p>
      </div>
    </section>
  </main>
}
