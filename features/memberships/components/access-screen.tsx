'use client'

import { CheckCircle2, KeyRound, LoaderCircle } from 'lucide-react'
import { useState, useTransition } from 'react'

import { useConfirm } from '@/components/shared/confirm-provider'
import { StatusDot } from '@/components/ui/status-dot'
import { sendPasswordResetLinkAction } from '../actions/send-reset-link'

export type AccessRow = { userId: string; name: string; email: string | null; roleLabel: string; status: string; canReset: boolean }

/**
 * Users and their passwords. Nobody changes their own password in UNISON: an Owner or Admin sends the person a reset link from
 * here. The button is shown only where the signed-in person is allowed to use it, and the server checks that again.
 */
export function AccessScreen({ rows, canManage }: { rows: AccessRow[]; canManage: boolean }) {
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function send(row: AccessRow) {
    if (!(await confirm({ title: `Send a reset link to ${row.name}?`, message: `${row.email} will get an email with a link to choose a new password. The link works for 60 minutes.`, confirmLabel: 'Send link' }))) return
    setError(null)
    setBusy(row.userId)
    startTransition(async () => {
      try {
        const result = await sendPasswordResetLinkAction(row.userId)
        if (result.ok) setSent((current) => ({ ...current, [row.userId]: result.email }))
        else setError(result.error)
      } catch {
        setError('The reset link could not be sent. Reload the page and try again.')
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <section className="overflow-hidden border border-border bg-card">
      <header className="border-b border-border px-5 py-4">
        <h2 className="unison-section-title text-sm">Users and passwords</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Passwords are managed by an Owner or Admin. People cannot change their own; if someone is locked out, send them a reset link here.
          People who sign in with Microsoft use their Microsoft password, which UNISON does not hold.
        </p>
      </header>
      {error ? <p role="alert" className="border-b border-border bg-destructive/5 px-5 py-3 text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Members of this workspace</caption>
          <thead>
            <tr className="bg-muted/30 text-xs text-muted-foreground">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Password</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.userId}>
                <td className="px-5 py-3 font-medium text-foreground">{row.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{row.email ?? '—'}</td>
                <td className="px-5 py-3">{row.roleLabel}</td>
                <td className="px-5 py-3"><StatusDot status={row.status === 'active' ? 'Active' : row.status} /></td>
                <td className="px-5 py-3 text-right">
                  {sent[row.userId] ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-success" aria-hidden="true" />Link sent to {sent[row.userId]}</span>
                  ) : row.canReset ? (
                    <button type="button" disabled={pending} onClick={() => void send(row)} className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                      {busy === row.userId ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <KeyRound className="size-3.5" aria-hidden="true" />}
                      Send reset link
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{canManage ? 'Not available for this person' : '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage ? null : <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Only an Owner or Admin can send reset links.</p>}
    </section>
  )
}
