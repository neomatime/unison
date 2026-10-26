import { BillingPlansSwitch } from '@/features/documents/components/billing-plans-switch'
import { CompanyDetailsForm } from '@/features/documents/components/company-details-form'
import { QuotePortalSwitch } from '@/features/documents/components/quote-portal-switch'
import { getCompanySettings } from '@/features/documents/queries/get-company-settings'
import { documentContext } from '@/features/documents/server-context'
import { companyTermsManaged } from '@/features/terms/queries/company-terms'

export default async function Page() {
  const { settings, canEdit } = await getCompanySettings()
  const { organization, db } = await documentContext()
  const managed = await companyTermsManaged(db, organization.id)
  return (
    <>
      <CompanyDetailsForm settings={settings} canEdit={canEdit} termsManaged={managed} />
      <QuotePortalSwitch enabled={settings?.quote_portal_enabled ?? false} canEdit={canEdit} />
      <BillingPlansSwitch enabled={settings?.billing_plans_enabled ?? false} canEdit={canEdit} />
    </>
  )
}
