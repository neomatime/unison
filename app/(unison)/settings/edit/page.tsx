import { redirect } from 'next/navigation'

import { updateOrganizationProfileAction } from '@/features/organizations/actions/update-organization-profile'
import { OrganizationProfileEditForm } from '@/features/organizations/components/organization-profile-edit-form'
import { getOrganizationProfile } from '@/features/organizations/queries/get-organization-profile'

export default async function Page() {
  const profile = await getOrganizationProfile()
  if (!profile.canEdit) redirect('/settings')

  return <OrganizationProfileEditForm name={profile.name} action={updateOrganizationProfileAction} />
}
