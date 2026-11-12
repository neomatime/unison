import Link from 'next/link'

import type { RecordWorkspace } from '../types'
import { ContactsSection } from './contacts-section'
import { FollowUpsSection } from './follow-ups-section'
import { TimelineSection } from './timeline-section'
import { WorkspaceTabs, type WorkspaceTab } from './workspace-tabs'

export type WorkspaceSectionId = 'contacts' | 'timeline' | 'followups'

export function RecordWorkspaceSections({ workspace, sections }: { workspace: RecordWorkspace; sections: readonly WorkspaceSectionId[] }) {
  const { kind } = workspace
  const tabs: WorkspaceTab[] = []
  if (sections.includes('timeline')) {
    tabs.push({
      id: 'timeline',
      label: 'Timeline',
      content: <TimelineSection kind={kind} id={workspace.id} initial={workspace.timeline} currentUserId={workspace.currentUserId} canModerate={workspace.canModerate} />,
    })
  }
  if (sections.includes('followups') && kind !== 'quote') {
    tabs.push({
      id: 'followups',
      label: 'Follow-ups',
      count: workspace.followUps.length,
      content: (
        <FollowUpsSection
          parent={{ kind, id: workspace.id }}
          followUps={workspace.followUps}
          teamMembers={workspace.teamMembers}
          defaultAssigneeId={workspace.defaultAssigneeId}
        />
      ),
    })
  }
  if (sections.includes('contacts')) {
    tabs.push({
      id: 'contacts',
      label: 'Contacts',
      count: workspace.contacts.length,
      content: <ContactsSection parent={workspace.contactParent} contacts={workspace.contacts} note={workspace.contactsNote} />,
    })
  }
  return (
    <div className="mt-5 space-y-5">
      {workspace.conversion ? (
        <p className="border border-border bg-[var(--brand-soft)] px-5 py-3 text-sm text-foreground">
          This lead was converted.{' '}
          {workspace.conversion.clientId ? <Link href={`/operations/clients/${workspace.conversion.clientId}`} className="font-semibold text-brand hover:underline">View the client</Link> : null}
          {workspace.conversion.clientId && workspace.conversion.opportunityId ? ' · ' : null}
          {workspace.conversion.opportunityId ? <Link href={`/commercial/sales/${workspace.conversion.opportunityId}`} className="font-semibold text-brand hover:underline">View the opportunity</Link> : null}
        </p>
      ) : null}
      {tabs.length > 1 ? <WorkspaceTabs tabs={tabs} /> : tabs[0]?.content ?? null}
    </div>
  )
}
