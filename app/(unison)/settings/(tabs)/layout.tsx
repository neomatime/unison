import { requireViewOrRedirect } from '@/features/rights/server'
import { OrganizationSettingsFrame } from '@/features/organizations/components/organization-profile-screen'
import { getOrganizationProfile } from '@/features/organizations/queries/get-organization-profile'

// One frame for every Settings tab (Overview, Users & access, Integrations, Automations, Jobs & schedules). The layout stays
// mounted when a tab is chosen, so only the content under the tab bar changes.
export default async function SettingsTabsLayout({ children }: { children: React.ReactNode }) {
  // Only Owners and Admins (and anyone given the right) open Organisation settings.
  await requireViewOrRedirect('settings')
  const profile = await getOrganizationProfile()
  return <OrganizationSettingsFrame profile={profile}>{children}</OrganizationSettingsFrame>
}
