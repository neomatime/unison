// The integrations UNISON ships with, as rows for Settings > Integrations. Pure: no directive, no imports, so the tests load it
// directly. Each is set up outside the tenant-created event endpoints, so the page lists it itself and counts it.

export type BuiltInStatus = 'Connected' | 'Not connected' | 'Needs attention' | 'Admin only'

export type BuiltInIntegration = {
  id: 'microsoft-teams' | 'hive-client-feed'
  name: string
  provider: string
  description: string
  status: BuiltInStatus
  /** One short line under the status: the organiser, the last read, what is missing. Never a secret. */
  detail: string
  /** The panel for it on the same page. */
  href: string
}

/** Microsoft Teams. Connected when every setting is present; partly set is "Needs attention" (something was started and does not work);
 *  none set is "Not connected". Whether the last Graph call failed is not recorded, so it is not part of the status. */
export function teamsIntegration(status: { connected: boolean; missing: readonly string[] }, organizer: string | null): BuiltInIntegration {
  const partly = !status.connected && status.missing.length > 0 && status.missing.length < 4
  return {
    id: 'microsoft-teams',
    name: 'Microsoft Teams',
    provider: 'Microsoft Graph',
    description: 'Teams meetings and invitations for calendar events.',
    status: status.connected ? 'Connected' : partly ? 'Needs attention' : 'Not connected',
    detail: status.connected ? `Organiser mailbox ${organizer ?? ''}`.trim() : partly ? `Missing ${status.missing.join(', ')}` : 'No settings yet',
    href: '#microsoft-teams',
  }
}

/** The HIVE client feed. It is on when a live feed key exists: HIVE reads the feed with that key. Only owners and admins can see
 *  keys, so for anyone else (or when the read failed) the status is not known and is shown as "Admin only", not guessed. */
export function hiveIntegration(gate: { hasLiveKey: boolean; lastReadAt: string | null } | null): BuiltInIntegration {
  const base = {
    id: 'hive-client-feed' as const,
    name: 'HIVE Origin',
    provider: 'HIVE',
    description: 'Client feed: gives HIVE the clients to onboard, read with a feed key.',
    href: '#hive-client-feed',
  }
  if (!gate) return { ...base, status: 'Admin only', detail: 'Owners and admins manage the feed' }
  return {
    ...base,
    status: gate.hasLiveKey ? 'Connected' : 'Not connected',
    detail: gate.hasLiveKey ? (gate.lastReadAt ? 'HIVE has read the feed' : 'Key created, not read yet') : 'No live feed key',
  }
}

export type IntegrationCounts = { connections: number; active: number; attention: number }

/** The three summary cards: every built-in and every tenant-created endpoint counts as a connection; Connected ones are active;
 *  Needs attention is a built-in that is partly set up plus tenant endpoints reporting an error. */
export function countIntegrations(builtIns: readonly BuiltInIntegration[], tenant: { total: number; connected: number; errors: number }): IntegrationCounts {
  return {
    connections: builtIns.length + tenant.total,
    active: builtIns.filter((item) => item.status === 'Connected').length + tenant.connected,
    attention: builtIns.filter((item) => item.status === 'Needs attention').length + tenant.errors,
  }
}
