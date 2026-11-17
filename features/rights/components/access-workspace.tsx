'use client'

import { useRef, useState } from 'react'

import { AccessScreen, type AccessRow } from '@/features/memberships/components/access-screen'
import type { AuditEntry } from '../queries'
import { RightsManager, type ManagedUser } from './rights-manager'

/** Users & access: the people table, and below it the rights of the person chosen with "Manage rights". */
export function AccessWorkspace({ rows, canManage, notice, managed, audit, actorRole, actorId }: { rows: AccessRow[]; canManage: boolean; notice: string | null; managed: ManagedUser[]; audit: AuditEntry[]; actorRole: string; actorId: string }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(managed[0]?.key ?? null)
  const target = useRef<HTMLDivElement>(null)

  function manage(key: string) {
    setSelectedKey(key)
    target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <AccessScreen rows={rows} canManage={canManage} notice={notice} onManage={manage} selectedKey={selectedKey} />
      <div ref={target} className="scroll-mt-6">
        <RightsManager users={managed} audit={audit} selectedKey={selectedKey} onSelect={setSelectedKey} actorRole={actorRole} actorId={actorId} />
      </div>
    </>
  )
}
