import type React from 'react'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { entitledModuleIds } from '@/lib/auth/entitlement'
import type { UnisonModuleId } from '@/config/unison-tiers'
import { ModuleNotAvailable } from './module-not-available'

/**
 * A product boundary, not a data boundary. Next renders layouts and pages in
 * parallel, so a withheld page's queries may still run before this returns —
 * nothing leaks, because every query is RLS-scoped to the caller's organization,
 * but the security boundary remains RLS rather than this component.
 */
export async function ModuleGate({ moduleId, children }: { moduleId: UnisonModuleId; children: React.ReactNode }) {
  const entitled = await entitledModuleIds()
  if (entitled.includes(moduleId)) return <>{children}</>

  const { organization } = await getSessionContext()
  return <ModuleNotAvailable moduleId={moduleId} tier={organization.tier} />
}
