import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { Section, TasksData } from '../types'
import { DueDate } from './local-time'
import { EmptyState, ErrorState, Panel } from './panel'

const priorityStyle: Record<string, string> = {
  Critical: 'bg-red-50 text-red-800',
  High: 'bg-amber-50 text-amber-800',
  Medium: 'bg-muted text-foreground',
  Low: 'bg-muted text-[var(--briefing-muted)]',
}

export function MyTasks({ tasks }: { tasks: Section<TasksData> }) {
  let body: ReactNode
  let footer: ReactNode = null
  if (tasks.status !== 'ready') {
    body = <ErrorState what="Your tasks" />
  } else if (!tasks.data.linked) {
    body = (
      <EmptyState>
        Your account is not linked to a team profile, so no tasks can be assigned to you. <Link href="/people/team" className="font-semibold text-brand hover:underline">Open the Team workspace</Link>.
      </EmptyState>
    )
  } else if (tasks.data.tasks.length === 0) {
    body = <EmptyState>No open tasks are assigned to you.</EmptyState>
  } else {
    const { openCount, tasks: rows } = tasks.data
    body = (
      <ul className="divide-y divide-border">
        {rows.map((task) => (
          <li key={task.id}>
            <Link href={`/operations/tasks/${task.id}`} className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-brand">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{task.title}</span>
                <span className="block truncate text-xs text-[var(--briefing-muted)]">{task.related ?? 'No related record'} · {task.status}</span>
              </span>
              <span className="flex flex-col items-end gap-1 text-xs text-[var(--briefing-muted)]">
                {task.dueAt ? <DueDate iso={task.dueAt} /> : <span>No due date</span>}
                <span className={cn('px-1.5 py-0.5 text-[0.6875rem] font-medium', priorityStyle[task.priority] ?? 'bg-muted text-foreground')}>{task.priority}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    )
    footer = openCount > rows.length ? (
      <p className="border-t border-border px-5 py-3 text-xs text-[var(--briefing-muted)]">Showing {rows.length} of {openCount} open tasks, soonest due first.</p>
    ) : null
  }

  return (
    <Panel
      title="My tasks"
      description="Open tasks assigned to you."
      action={<Link href="/operations/tasks" className="text-xs font-semibold text-brand hover:underline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand">View all tasks →</Link>}
    >
      {body}
      {footer}
    </Panel>
  )
}
