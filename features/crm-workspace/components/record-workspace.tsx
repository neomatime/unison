import Link from 'next/link'

import type { RecordWorkspace } from '../types'
import { ContactsSection } from './contacts-section'
import { FollowUpsSection } from './follow-ups-section'
import { TimelineSection } from './timeline-section'

export type WorkspaceSectionId = 'contacts' | 'timeline' | 'followups'

export function RecordWorkspaceSections({ workspace, sections }: { workspace: RecordWorkspace; sections: readonly WorkspaceSectionId[] }) {
  const { kind } = workspace
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
      {sections.includes('contacts') ? <ContactsSection parent={workspace.contactParent} contacts={workspace.contacts} note={workspace.contactsNote} /> : null}
      {sections.includes('followups') && kind !== 'quote' ? (
        <FollowUpsSection
          parent={{ kind, id: workspace.id }}
          followUps={workspace.followUps}
          teamMembers={workspace.teamMembers}
          defaultAssigneeId={workspace.defaultAssigneeId}
        />
      ) : null}
      {sections.includes('timeline') ? (
        <TimelineSection kind={kind} id={workspace.id} initial={workspace.timeline} currentUserId={workspace.currentUserId} canModerate={workspace.canModerate} />
      ) : null}
    </div>
  )
}
