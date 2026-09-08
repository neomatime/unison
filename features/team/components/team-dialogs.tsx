'use client'

import { X } from 'lucide-react'

import type { TeamMember } from '../data'

export type MemberAction = 'assignments' | 'capacity' | 'change-team' | 'change-role' | 'availability' | null

export function MemberActionDialog({ member, action, onClose }: { member: TeamMember | null; action: MemberAction; onClose: () => void }) {
  if (!member || (action !== 'assignments' && action !== 'capacity')) return null
  const title = action === 'assignments' ? 'Project Assignments' : 'Capacity Detail'
  return <div className="fixed inset-0 z-[85]" onMouseDown={onClose}><div className="absolute inset-0 bg-foreground/25" /><aside role="dialog" aria-modal="true" aria-labelledby="member-action-title" onMouseDown={(event) => event.stopPropagation()} className="absolute top-0 right-0 flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl"><header className="flex items-start justify-between border-b border-border p-6"><div><p className="text-xs font-semibold tracking-wide text-brand uppercase">{member.name}</p><h2 id="member-action-title" className="mt-1 text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">Read-only delivery allocation context.</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button></header><div className="flex-1 overflow-y-auto p-6"><div className="grid gap-3 sm:grid-cols-2"><Info label="Current projects" value={String(member.projects)} /><Info label="Allocated capacity" value={`${member.capacity}%`} /><Info label="Available capacity" value={`${Math.max(0, 100 - member.capacity)}%`} /><Info label="Availability" value={member.availability} /></div><div className="mt-5 divide-y divide-border border border-border">{(member.projectNames.length ? member.projectNames : ['No active assignments']).map((project, index) => <div key={project} className="flex items-center justify-between p-4"><div><p className="text-sm font-semibold">{project}</p><p className="mt-1 text-xs text-muted-foreground">{member.role} · {index ? '30%' : `${Math.min(member.capacity, 60)}%`} allocation</p></div></div>)}</div></div><footer className="flex justify-end border-t border-border p-5"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Close</button></footer></aside></div>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div> }
