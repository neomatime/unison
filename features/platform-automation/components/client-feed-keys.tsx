'use client'

import { KeyRound, LoaderCircle, Trash2 } from 'lucide-react'
import { useActionState, useState, useTransition } from 'react'

import { createClientFeedKeyAction, revokeClientFeedKeyAction } from '../client-feed-actions'
import type { ClientFeedKey } from '../client-feed-queries'

function dateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value))
    : 'Never'
}

export function ClientFeedKeys({ keys }: { keys: ClientFeedKey[] }) {
  const [state, action, pending] = useActionState(createClientFeedKeyAction, undefined)
  const [revoking, startRevoke] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function revoke(key: ClientFeedKey) {
    if (!window.confirm(`Revoke "${key.name}"? Anything using it stops receiving clients immediately.`)) return
    setError(null)
    startRevoke(async () => {
      const result = await revokeClientFeedKeyAction(key.id)
      if (result.error) setError(result.error)
    })
  }

  return (
    <section className="mt-5 overflow-hidden border border-border bg-card" aria-label="Client feed keys">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <KeyRound className="mt-0.5 size-5 text-brand" aria-hidden />
        <div>
          <h2 className="unison-section-title text-sm">Client feed keys</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Lets HIVE read this organization&apos;s clients (<code>/api/v1/clients</code>, read-only). A key is shown once when created.
          </p>
        </div>
      </header>
      {state?.key ? (
        <div role="status" className="m-5 border border-warning/30 bg-warning-soft/35 p-4">
          <p className="text-xs font-semibold text-warning">Copy this key now. It will not be shown again.</p>
          <code className="mt-2 block break-all text-sm text-foreground">{state.key}</code>
        </div>
      ) : null}
      {keys.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-foreground">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Last used</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-t border-border">
                  <td className="px-5 py-3 text-sm font-semibold">{key.name}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{dateTime(key.createdAt)}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{dateTime(key.lastUsedAt)}</td>
                  <td className="px-5 py-3 text-sm">{key.revokedAt ? `Revoked ${dateTime(key.revokedAt)}` : 'Active'}</td>
                  <td className="px-5 py-3 text-right">
                    {key.revokedAt ? null : (
                      <button type="button" disabled={revoking} onClick={() => revoke(key)} className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive disabled:opacity-60">
                        <Trash2 className="size-4" aria-hidden /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">No keys yet.</p>
      )}
      <form action={action} className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium">
          New key name
          <input name="name" required maxLength={80} placeholder="HIVE" className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm" />
        </label>
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>
      {state?.error || error ? <p role="alert" className="px-5 pb-4 text-sm text-destructive">{state?.error ?? error}</p> : null}
    </section>
  )
}
