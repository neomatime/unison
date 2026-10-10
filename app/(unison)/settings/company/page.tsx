import { CompanyDetailsForm } from '@/features/documents/components/company-details-form'
import { getCompanySettings } from '@/features/documents/queries/get-company-settings'

export default async function Page() {
  const { settings, canEdit } = await getCompanySettings()
  return <CompanyDetailsForm settings={settings} canEdit={canEdit} />
}
