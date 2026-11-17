'use client'

import { Check, LoaderCircle, RotateCcw, Search } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { useConfirm } from '@/components/shared/confirm-provider'
import { InfoHint } from '@/components/ui/info-hint'
import { Dropdown } from '@/components/ui/select'
import { StatusDot } from '@/components/ui/status-dot'
import { cn } from '@/lib/utils'
import { resetRightsAction, saveRightsAction } from '../actions'
import { DATA_SCOPES, RESTRICTIONS, RIGHT_ACTIONS, RIGHT_MODULES, SCOPE_HINTS, SCOPE_LABELS, can, cleanOverrides, cleanRestrictions, cleanScopes, defaultScope, effectiveGrid, roleAllows, sensitiveChanges, type DataScope, type Overrides, type RightAction, type Scopes } from '../model'
import type { AuditEntry } from '../queries'

export type ManagedUser = {
  key: string
  userId: string | null
  email: string | null
  name: string
  roleId: string
  roleLabel: string
  signedIn: boolean
  /** Whether the signed-in person may change this person's rights. */
  editable: boolean
  overrides: Overrides
  scopes: Scopes
  restrictions: string[]
}

type Tab = 'permissions' | 'data' | 'restrictions' | 'history'
const TABS: { id: Tab; label: string }[] = [
  { id: 'permissions', label: 'Permissions' },
  { id: 'data', label: 'Data access' },
  { id: 'restrictions', label: 'Restrictions' },
  { id: 'history', label: 'Activity history' },
]

const ACTION_LABELS: Record<RightAction, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve', export: 'Export' }
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
const when = (iso: string) => new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * User rights: a searchable list of people on the left, and the chosen person's permissions, data access, restrictions and activity
 * history on the right. Changes are a draft until Save changes; the server checks who may change whose rights, refuses rights the
 * person saving does not hold, and writes every change to the history.
 */
export function RightsManager({ users, audit, selectedKey, onSelect, actorRole, actorId }: { users: ManagedUser[]; audit: AuditEntry[]; selectedKey: string | null; onSelect: (key: string) => void; actorRole: string; actorId: string }) {
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('permissions')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = users.find((user) => user.key === selectedKey) ?? users[0] ?? null
  // The draft belongs to one person; choosing someone else starts from what is saved for them.
  const [draftFor, setDraftFor] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [scopes, setScopes] = useState<Scopes>({})
  const [restrictions, setRestrictions] = useState<string[]>([])
  if (selected && draftFor !== selected.key) {
    setDraftFor(selected.key)
    setOverrides(selected.overrides)
    setScopes(selected.scopes)
    setRestrictions(selected.restrictions)
    setError(null)
  }

  const shown = useMemo(() => users.filter((user) => `${user.name} ${user.email ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [users, query])
  if (!selected) return null

  const grid = effectiveGrid({ role: selected.roleId, overrides, restrictions })
  const roleGrid = effectiveGrid({ role: selected.roleId, overrides: {}, restrictions: [] })
  const owner = selected.roleId === 'owner'
  const locked = owner || !selected.editable
  const dirty = JSON.stringify([cleanOverrides(selected.roleId, overrides), cleanScopes(scopes), cleanRestrictions(restrictions)]) !== JSON.stringify([cleanOverrides(selected.roleId, selected.overrides), cleanScopes(selected.scopes), cleanRestrictions(selected.restrictions)])
  const customised = Object.keys(cleanOverrides(selected.roleId, overrides)).length > 0 || restrictions.length > 0 || Object.keys(cleanScopes(scopes)).length > 0

  function toggle(moduleId: string, action: RightAction, value: boolean) {
    setSaved(null)
    setOverrides((current) => ({ ...current, [moduleId]: { ...current[moduleId], [action]: value } }))
  }

  async function save() {
    if (!selected) return
    const after = { overrides: cleanOverrides(selected.roleId, overrides), restrictions: cleanRestrictions(restrictions) }
    const risky = sensitiveChanges(selected.roleId, { overrides: cleanOverrides(selected.roleId, selected.overrides), restrictions: selected.restrictions }, after)
    if (risky.length && !(await confirm({ title: `Save these changes for ${selected.name}?`, message: `${risky.join('. ')}. The change applies at once.`, confirmLabel: 'Save changes' }))) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await saveRightsAction({ userId: selected.userId, email: selected.email }, { overrides: after.overrides, scopes: cleanScopes(scopes), restrictions: after.restrictions })
        if (result.ok) setSaved(`Saved. ${selected.name}’s rights apply now.`)
        else setError(result.error)
      } catch {
        setError('The rights could not be saved. Reload the page and try again.')
      }
    })
  }

  async function reset() {
    if (!selected) return
    if (!(await confirm({ title: `Reset ${selected.name} to the ${selected.roleLabel} defaults?`, message: 'Every customised permission, data-access choice and restriction is removed. The change applies at once.', confirmLabel: 'Reset to defaults' }))) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await resetRightsAction({ userId: selected.userId, email: selected.email })
        if (result.ok) { setOverrides({}); setScopes({}); setRestrictions([]); setSaved('Reset to the role defaults.') }
        else setError(result.error)
      } catch {
        setError('The rights could not be reset. Reload the page and try again.')
      }
    })
  }

  const capabilities = [
    ['Manage users and access', can({ role: selected.roleId, overrides, restrictions }, 'settings', 'edit') && can({ role: selected.roleId, overrides, restrictions }, 'team', 'delete')],
    ['Configure organisation settings', can({ role: selected.roleId, overrides, restrictions }, 'settings', 'edit')],
    ['Approve quotations and invoices', can({ role: selected.roleId, overrides, restrictions }, 'quotes', 'approve') || can({ role: selected.roleId, overrides, restrictions }, 'invoices', 'approve')],
    ['See financial records', can({ role: selected.roleId, overrides, restrictions }, 'invoices', 'view')],
  ] as const

  return (
    <section className="mt-6 border border-border bg-card" aria-labelledby="rights-heading">
      <header className="border-b border-border px-5 py-4">
        <h2 id="rights-heading" className="unison-section-title text-sm">User rights management</h2>
        <p className="mt-1 text-xs text-muted-foreground">Manage what each user can access and do in UNISON. Select a user to view and update their permissions, data access and restrictions.</p>
      </header>
      <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="border-b border-border p-4 lg:border-r lg:border-b-0">
          <label className="relative block">
            <span className="sr-only">Search users</span>
            <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users…" className="h-10 w-full border border-border bg-background pr-3 pl-9 text-sm" />
          </label>
          <ul className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto" aria-label="Users">
            {shown.map((user) => (
              <li key={user.key}>
                <button type="button" onClick={() => onSelect(user.key)} aria-current={user.key === selected.key ? 'true' : undefined} className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted', user.key === selected.key && 'bg-brand/15')}>
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center bg-brand/80 text-xs font-semibold text-white">{initials(user.name)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.name}</span><span className="block truncate text-xs text-muted-foreground">{user.roleLabel}</span></span>
                  <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{user.signedIn ? 'Active' : 'Not signed in yet'}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-3 py-4 text-xs text-muted-foreground">No one matches.</li> : null}
          </ul>
        </div>

        <div className="min-w-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center bg-brand text-sm font-semibold text-white">{initials(selected.name)}</span>
              <div className="min-w-0"><h3 className="truncate text-base font-medium">{selected.name}</h3><p className="truncate text-xs text-muted-foreground">{selected.email ?? '—'}</p></div>
            </div>
            <dl className="flex flex-wrap gap-6 text-xs">
              <div><dt className="text-muted-foreground">Role</dt><dd className="mt-1 font-medium">{selected.roleLabel}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1"><StatusDot status={selected.signedIn ? 'Active' : 'Not signed in yet'} tone={selected.signedIn ? 'positive' : 'neutral'} /></dd></div>
            </dl>
            <button type="button" onClick={() => void reset()} disabled={pending || locked || !customised} className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
              <RotateCcw className="size-3.5" aria-hidden="true" />Reset to role defaults
            </button>
          </div>

          {locked ? (
            <p role="status" className="mt-4 border-l-2 border-brand bg-brand-soft/40 px-4 py-2.5 text-xs">
              {owner ? 'An Owner has every right and it cannot be changed or restricted.' : selected.userId === actorId ? 'You cannot change your own rights.' : 'Only an Owner can change this person’s rights.'}
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p> : null}
          {saved ? <p role="status" className="mt-4 flex items-center gap-2 border-l-2 border-success bg-success-soft/40 px-4 py-2.5 text-sm"><Check className="size-4 text-success" aria-hidden="true" />{saved}</p> : null}

          <div role="tablist" aria-label="Rights sections" className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((item) => (
              <button key={item.id} role="tab" type="button" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn('border-b-2 px-4 py-2.5 text-sm font-medium', tab === item.id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{item.label}</button>
            ))}
          </div>

          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">
              {tab === 'permissions' ? (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">Control what this user can do in each area of UNISON. Permissions start from the role and can be customised for this user; a dot marks a change from the role.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead><tr className="bg-muted/30 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"><th className="px-3 py-2.5">Module / area</th>{RIGHT_ACTIONS.map((action) => <th key={action} className="px-2 py-2.5 text-center">{ACTION_LABELS[action]}</th>)}</tr></thead>
                      <tbody>
                        {RIGHT_MODULES.map((module) => (
                          <tr key={module.id} className="border-t border-border">
                            <th scope="row" className="px-3 py-2 font-normal">{module.label}</th>
                            {RIGHT_ACTIONS.map((action) => {
                              const value = grid[module.id][action]
                              if (value === null) return <td key={action} className="px-2 py-2 text-center text-muted-foreground" aria-label="Not applicable">–</td>
                              const changed = value !== roleGrid[module.id][action]
                              // Granting needs the signed-in person to hold the right; taking one away is always allowed.
                              const cannotGrant = !value && !roleAllows(actorRole, module.id, action)
                              const restricted = restrictions.length > 0 && value === false && can({ role: selected.roleId, overrides, restrictions: [] }, module.id, action)
                              return (
                                <td key={action} className="px-2 py-2 text-center">
                                  <label className="relative inline-flex size-6 items-center justify-center">
                                    <input type="checkbox" checked={value} disabled={locked || pending || cannotGrant || restricted} onChange={(event) => toggle(module.id, action, event.target.checked)} aria-label={`${ACTION_LABELS[action]} ${module.label}`} className="size-4 accent-[var(--brand)]" />
                                    {changed ? <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-1.5 bg-brand" /> : null}
                                  </label>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {tab === 'data' ? (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">Choose which records this user sees in each area. <span className="font-medium text-foreground">Saved now and applied to records in the next release;</span> until then the user sees what their permissions allow.</p>
                  <ul className="divide-y divide-border border border-border">
                    {RIGHT_MODULES.filter((module) => module.scoped).map((module) => (
                      <li key={module.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm">{module.label}</span>
                        <span className="inline-flex items-center gap-2">
                          <Dropdown aria-label={`Data access for ${module.label}`} value={scopes[module.id] ?? defaultScope()} disabled={locked || pending} onChange={(event) => { setSaved(null); setScopes((current) => ({ ...current, [module.id]: event.target.value as DataScope })) }} className="h-9 w-44 text-sm">
                            {DATA_SCOPES.map((scope) => <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>)}
                          </Dropdown>
                          <InfoHint label={SCOPE_LABELS[scopes[module.id] ?? defaultScope()].toLowerCase()} text={SCOPE_HINTS[scopes[module.id] ?? defaultScope()]} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {tab === 'restrictions' ? (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">Restrictions always deny, whatever the role or permissions say. Use them to keep sensitive areas away from this user.</p>
                  <ul className="divide-y divide-border border border-border">
                    {RESTRICTIONS.map((restriction) => (
                      <li key={restriction.id} className="flex items-start gap-3 px-4 py-3">
                        <input id={`r-${restriction.id}`} type="checkbox" checked={restrictions.includes(restriction.id)} disabled={locked || pending} onChange={(event) => { setSaved(null); setRestrictions((current) => (event.target.checked ? [...current, restriction.id] : current.filter((id) => id !== restriction.id))) }} className="mt-1 size-4 accent-[var(--brand)]" />
                        <label htmlFor={`r-${restriction.id}`} className="text-sm"><span className="font-medium">{restriction.label}</span><span className="block text-xs text-muted-foreground">{restriction.description}{restriction.enforced ? '' : ' Saved now and applied in the next release.'}</span></label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {tab === 'history' ? <History audit={audit} subject={selected} /> : null}
            </div>

            <aside className="h-fit border border-border p-4 text-sm" aria-label="Role and access summary">
              <h4 className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Role & access summary</h4>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Role</dt><dd className="font-medium">{selected.roleLabel}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Access level</dt><dd className="font-medium">{owner ? 'Full access' : customised ? 'Customised' : 'Role defaults'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Data scope</dt><dd className="font-medium">{Object.keys(cleanScopes(scopes)).length ? 'Limited in some areas' : 'All organisation records'}</dd></div>
              </dl>
              <h4 className="mt-4 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Key capabilities</h4>
              <ul className="mt-2 space-y-1.5 text-xs">
                {capabilities.map(([label, on]) => <li key={label} className={cn('flex items-center gap-2', !on && 'text-muted-foreground')}><span aria-hidden="true" className={on ? 'text-success' : ''}>{on ? '✓' : '✗'}</span>{label}<span className="sr-only">: {on ? 'yes' : 'no'}</span></li>)}
              </ul>
            </aside>
          </div>

          {tab !== 'history' ? (
            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" disabled={pending || !dirty} onClick={() => { setOverrides(selected.overrides); setScopes(selected.scopes); setRestrictions(selected.restrictions); setError(null); setSaved(null) }} className="h-10 border border-border px-5 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancel</button>
              <button type="button" disabled={pending || !dirty || locked} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 bg-brand px-5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50">
                {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}Save changes
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function History({ audit, subject }: { audit: AuditEntry[]; subject: ManagedUser }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'all' | AuditEntry['kind']>('all')
  const [everyone, setEveryone] = useState(false)
  const rows = audit.filter((entry) => {
    if (!everyone && entry.subjectKey !== (subject.userId ?? subject.email?.toLowerCase())) return false
    if (kind !== 'all' && entry.kind !== kind) return false
    const needle = text.trim().toLowerCase()
    return !needle || `${entry.actor} ${entry.subject} ${entry.summary} ${entry.changes.map((change) => change.label).join(' ')}`.toLowerCase().includes(needle)
  })
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1"><span className="sr-only">Search the activity history</span><Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Search activity…" className="h-9 w-full border border-border bg-background pr-3 pl-9 text-sm" /></label>
        <Dropdown aria-label="Type of change" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-9 w-44 text-sm">
          <option value="all">All changes</option><option value="rights.updated">Rights changed</option><option value="rights.reset">Reset to defaults</option><option value="role.changed">Role changed</option>
        </Dropdown>
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={everyone} onChange={(event) => setEveryone(event.target.checked)} className="size-4 accent-[var(--brand)]" />Everyone</label>
      </div>
      {rows.length === 0 ? <p className="border border-border px-4 py-6 text-center text-sm text-muted-foreground">No changes recorded{everyone ? '' : ` for ${subject.name}`} yet.</p> : (
        <ol className="divide-y divide-border border border-border">
          {rows.map((entry) => (
            <li key={entry.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{entry.summary}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{entry.actor} · {entry.subject} · {when(entry.at)}</p>
              {entry.changes.length > 1 ? (
                <details className="mt-1.5 text-xs"><summary className="cursor-pointer text-brand">Show {entry.changes.length} changes</summary>
                  <ul className="mt-1.5 space-y-0.5">{entry.changes.map((change, index) => <li key={index}>{change.label}: <span className="text-muted-foreground">{change.before}</span> → {change.after}</li>)}</ul>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
