import 'server-only'
import { getEntitledModuleIds, type UnisonModuleId } from '@/config/unison-tiers'
import { getSessionContext } from './get-session-context'

/**
 * The modules this tenant's tier includes. Costs nothing: getSessionContext is
 * already wrapped in React's cache() and already joins organizations, so the tier
 * arrives with the session and the mapping is pure.
 */
export async function entitledModuleIds(): Promise<UnisonModuleId[]> {
  const { organization } = await getSessionContext()
  return getEntitledModuleIds(organization.tier)
}
