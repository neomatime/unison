import { OrganizationProfileScreen } from '@/features/organizations/components/organization-profile-screen'
import { getOrganizationProfile } from '@/features/organizations/queries/get-organization-profile'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const [{ saved }, profile] = await Promise.all([searchParams, getOrganizationProfile()])

  return <OrganizationProfileScreen profile={profile} saved={saved === '1'} />
}
