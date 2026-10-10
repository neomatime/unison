'use client'

import { useActionState } from 'react'

import { DueDate } from '@/features/crm-overview/components/local-time'
import { addFollowUpAction, setFollowUpDoneAction } from '../actions/follow-ups'
import type { FollowUp, TeamMemberOption } from '../types'
import { FOLLOW_UP_PRIORITIES } from '../vocabulary'
import { ActionButton } from './action-button'
import { Feedback, input } from './form-parts'
import { WorkspaceSection } from './workspace-section'

type Parent = { kind: 'lead' | 'client' | 'opportunity'; id: string }

export function FollowUpsSection({
  parent, followUps, teamMembers, defaultAssigneeId,
}: { parent: Parent; followUps: FollowUp[]; teamMembers: TeamMemberOption[]; defaultAssigneeId: string | null }) {
  const open = followUps.filter((item) => !item.done)
  const done = followUps.filter((item) => item.done)
  return (
    <WorkspaceSection title="Follow-ups" description="Things to do next. They also appear in My Tasks for whoever they are assigned to.">
      {open.length ? (
        <ul className="divide-y divide-border">
          {open.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-[var(--briefing-muted)]">
                  {item.assignee ?? 'Unassigned'} · {item.priority} · {item.dueAt ? <DueDate iso={item.dueAt} /> : 'No due date'}
                </p>
              </div>
              <ActionButton action={setFollowUpDoneAction.bind(null, item.id, true)} label="Mark done" ariaLabel={`Mark done: ${item.title}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No open follow-ups.</p>
      )}
      {done.length ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-[var(--briefing-muted)]">{done.length} completed</summary>
          <ul className="divide-y divide-border">
            {done.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <p className="text-sm text-[var(--briefing-muted)] line-through">{item.title}</p>
                <ActionButton action={setFollowUpDoneAction.bind(null, item.id, false)} label="Reopen" ariaLabel={`Reopen: ${item.title}`} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <AddFollowUpForm parent={parent} teamMembers={teamMembers} defaultAssigneeId={defaultAssigneeId} />
    </WorkspaceSection>
  )
}

function AddFollowUpForm({ parent, teamMembers, defaultAssigneeId }: { parent: Parent; teamMembers: TeamMemberOption[]; defaultAssigneeId: string | null }) {
  const [state, action, pending] = useActionState(addFollowUpAction.bind(null, parent.kind, parent.id), undefined)
  return (
    <form action={action} className="grid gap-3 border-t border-border p-5 md:grid-cols-2">
      <input name="title" required aria-label="Follow-up title" placeholder="What needs to happen?" className={`${input} md:col-span-2`} />
      <input name="dueDate" type="date" aria-label="Due date" className={input} />
      <select name="priority" aria-label="Priority" defaultValue="Medium" className={input}>
        {FOLLOW_UP_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </select>
      <select name="assigneeId" aria-label="Assigned to" defaultValue={defaultAssigneeId ?? ''} className={input}>
        <option value="">Unassigned</option>
        {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button disabled={pending} className="ml-auto bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Add follow-up</button>
      </div>
    </form>
  )
}
