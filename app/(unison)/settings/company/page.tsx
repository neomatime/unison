import { CompanyDetailsForm } from '@/features/documents/components/company-details-form'
import { getCompanySettings } from '@/features/documents/queries/get-company-settings'
import { documentContext } from '@/features/documents/server-context'
import { companyTermsManaged } from '@/features/terms/queries/company-terms'

export default async function Page() {
  const { settings, canEdit } = await getCompanySettings()
  const { organization, db } = await documentContext()
  const managed = await companyTermsManaged(db, organization.id)
  return <CompanyDetailsForm settings={settings} canEdit={canEdit} termsManaged={managed} />
}
