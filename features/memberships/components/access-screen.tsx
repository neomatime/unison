'use client'

import { CheckCircle2, KeyRound, LoaderCircle } from 'lucide-react'
import { useState, useTransition } from 'react'

import { useConfirm } from '@/components/shared/confirm-provider'
import { Dropdown } from '@/components/ui/select'
import { StatusDot } from '@/components/ui/status-dot'
import { sendPasswordResetLinkAction } from '../actions/send-reset-link'
import { setAdvanceRoleAction, setMemberRoleAction } from '../actions/set-role'

export type RoleOption = { id: string; label: string }
export type AccessRow = {
  key: string
  /** Null for someone in the Microsoft directory who has not signed in yet. */
  userId: string | null
  name: string
  email: string | null
  roleId: string
  roleLabel: string
  signedIn: boolean
  chosenInAdvance: boolean
  canReset: boolean
  /** The roles this person's role may be changed to by the signed-in person, or empty when it may not be changed. */
  roleOptions: RoleOption[]
}

/**
 * Users and their passwords. Nobody changes their own password in UNISON: an Owner or Admin sends the person a reset link from
 * here. The button is shown only where the signed-in person is allowed to use it, and the server checks that again.
 */
export function AccessScreen({ rows: initial, canManage, notice }: { rows: AccessRow[]; canManage: boolean; notice?: string | null }) {
  const [rows, setRows] = useState(initial)
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function changeRole(row: AccessRow, roleId: string, label: string) {
    if (roleId === row.roleId) return
    const before = rows
    setError(null)
    setRows((current) => current.map((item) => (item.key === row.key ? { ...item, roleId, roleLabel: label, chosenInAdvance: !item.signedIn } : item)))
    startTransition(async () => {
      try {
        const result = row.userId ? await setMemberRoleAction(row.userId, roleId) : await setAdvanceRoleAction(row.email ?? '', roleId)
        if (!result.ok) { setRows(before); setError(result.error) }
      } catch {
        setRows(before)
        setError('The role could not be saved. Reload the page and try again.')
      }
    })
  }

  async function send(row: AccessRow) {
    if (!row.userId) return
    if (!(await confirm({ title: `Send a reset link to ${row.name}?`, message: `${row.email} will get an email with a link to choose a new password. The link works for 60 minutes.`, confirmLabel: 'Send link' }))) return
    setError(null)
    setBusy(row.key)
    startTransition(async () => {
      try {
        const result = await sendPasswordResetLinkAction(row.userId as string)
        if (result.ok) setSent((current) => ({ ...current, [row.key]: result.email }))
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
        <h2 className="unison-section-title text-sm">Users & access</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Everyone with a HIMARK Microsoft account is listed. People who have not signed in yet can be given their role now; it applies when they first sign in.
          Only an Owner changes roles. Passwords are managed by an Owner or Admin: send a reset link if someone is locked out. People who sign in with Microsoft use their Microsoft password, which UNISON does not hold.
        </p>
      </header>
      {notice ? <p role="status" className="border-b border-border bg-brand-soft/40 px-5 py-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="border-b border-border bg-destructive/5 px-5 py-3 text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
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
              <tr key={row.key}>
                <td className="px-5 py-3 font-medium text-foreground">{row.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{row.email ?? '—'}</td>
                <td className="px-5 py-3">
                  {row.roleOptions.length ? (
                    <Dropdown aria-label={`Role for ${row.name}`} value={row.roleId} disabled={pending} onChange={(event) => changeRole(row, event.target.value, row.roleOptions.find((option) => option.id === event.target.value)?.label ?? event.target.value)} className="h-9 w-36 text-sm">
                      {row.roleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </Dropdown>
                  ) : row.roleLabel}
                  {!row.signedIn ? <span className="mt-1 block text-[0.6875rem] text-muted-foreground">{row.chosenInAdvance ? 'Applies at first sign-in' : 'Default at first sign-in'}</span> : null}
                </td>
                <td className="px-5 py-3"><StatusDot status={row.signedIn ? 'Active' : 'Not signed in yet'} tone={row.signedIn ? 'positive' : 'neutral'} /></td>
                <td className="px-5 py-3 text-right">
                  {!row.signedIn ? (
                    <span className="text-xs text-muted-foreground">Signs in with Microsoft</span>
                  ) : sent[row.key] ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-success" aria-hidden="true" />Link sent to {sent[row.key]}</span>
                  ) : row.canReset ? (
                    <button type="button" disabled={pending} onClick={() => void send(row)} className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                      {busy === row.key ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <KeyRound className="size-3.5" aria-hidden="true" />}
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
