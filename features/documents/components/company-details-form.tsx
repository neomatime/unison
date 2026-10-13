'use client'

import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError, FormFooter, FormSection } from '@/components/ui/form-layout'
import { saveCompanyDetailsAction } from '../actions/company'
import type { CompanySettings } from '../types'

export function CompanyDetailsForm({ settings, canEdit, termsManaged = { quote: false, invoice: false } }: { settings: CompanySettings | null; canEdit: boolean; termsManaged?: { quote: boolean; invoice: boolean } }) {
  const [state, run, pending] = useActionState(saveCompanyDetailsAction, undefined)
  const [, startTransition] = useTransition()
  const [dirty, setDirty] = useState(false)
  const value = (key: keyof CompanySettings, fallback = '') => String(settings?.[key] ?? fallback)

  return (
    <>
      <WorkspaceHeader
        category="Settings"
        parent={{ label: 'Organisation Profile', href: '/settings' }}
        title="Company details"
        description="Printed on every quote and invoice. A copy is frozen onto each document when it is sent or issued, so changing these never rewrites an old document."
      />
      {!canEdit ? (
        <p role="note" className="mb-4 border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only an owner or admin can change these details.
        </p>
      ) : null}
      <form
        onChange={() => setDirty(true)}
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          setDirty(false)
          startTransition(() => run(data))
        }}
        className="mx-auto max-w-5xl space-y-5"
      >
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-5 border-0 p-0">
          <FormSection title="Company" description="Who the documents come from.">
            <TextField name="legalName" label="Company name" required defaultValue={value('legal_name')} />
            <TextField name="tagline" label="Tagline" defaultValue={value('tagline')} />
            <TextField name="vatNumber" label="VAT number" defaultValue={value('vat_number')} />
            <TextField name="email" label="Email" type="email" defaultValue={value('email')} />
            <TextField name="phone" label="Phone" type="tel" defaultValue={value('phone')} />
            <TextField name="website" label="Website" defaultValue={value('website')} />
          </FormSection>

          <FormSection title="Address">
            <TextField name="addressLine1" label="Address line 1" defaultValue={value('address_line1')} />
            <TextField name="addressLine2" label="Address line 2" defaultValue={value('address_line2')} />
            <TextField name="city" label="City" defaultValue={value('city')} />
            <TextField name="postalCode" label="Postal code" defaultValue={value('postal_code')} />
            <TextField name="country" label="Country" defaultValue={value('country')} />
          </FormSection>

          <FormSection title="Bank details" description="Printed in the bank panel of every quote and invoice.">
            <TextField name="bankName" label="Bank" defaultValue={value('bank_name')} />
            <TextField name="bankAccountName" label="Account name" defaultValue={value('bank_account_name')} />
            <TextField name="bankAccountNumber" label="Account number" defaultValue={value('bank_account_number')} />
            <TextField name="bankBranchCode" label="Branch code" defaultValue={value('bank_branch_code')} />
            <TextField name="bankAccountType" label="Account type" defaultValue={value('bank_account_type')} />
          </FormSection>

          <FormSection title="Documents" description="Numbers look like PREFIX-Q-2026-00001 for quotes and PREFIX-I-2026-00001 for invoices, and restart every January.">
            <TextField name="documentPrefix" label="Document prefix (2 to 8 letters or numbers)" required defaultValue={value('document_prefix')} />
            <TextField name="vatRate" label="VAT rate (%)" defaultValue={value('vat_rate', '15')} />
            <TextField name="defaultQuoteValidDays" label="Quotes are valid for (days)" defaultValue={value('default_quote_valid_days', '30')} />
            <TextField name="defaultPaymentDays" label="Invoices are due after (days)" defaultValue={value('default_payment_days', '30')} />
            {termsManaged.quote ? (
              <ManagedTerms name="defaultQuoteTerms" label="Quote terms" current={value('default_quote_terms')} />
            ) : (
              <TextAreaField name="defaultQuoteTerms" label="Default quote terms (one per line)" defaultValue={value('default_quote_terms')} className="md:col-span-2" />
            )}
            {termsManaged.invoice ? (
              <ManagedTerms name="defaultPaymentTerms" label="Payment terms" current={value('default_payment_terms')} />
            ) : (
              <TextAreaField name="defaultPaymentTerms" label="Default payment terms" defaultValue={value('default_payment_terms')} className="md:col-span-2" />
            )}
            <TextAreaField name="quoteClosingText" label="Closing text on a quote (“Next steps”)" rows={3} defaultValue={value('quote_closing_text')} className="md:col-span-2" />
            <TextAreaField name="invoiceClosingText" label="Closing text on an invoice (“Thank you”)" rows={3} defaultValue={value('invoice_closing_text')} className="md:col-span-2" />
          </FormSection>

          <FormSection title="Branding" description="A file in the app’s /brand folder, for example /brand/banner.png. Leave a field empty for a plain header.">
            <TextField name="logoPath" label="Logo image" placeholder="/brand/logo.png" defaultValue={value('logo_path')} />
            <TextField name="headerImagePath" label="Header image" placeholder="/brand/header.png" defaultValue={value('header_image_path')} />
          </FormSection>
        </fieldset>

        <FormError message={state?.error} />
        {state?.success && !dirty && !pending ? (
          <p role="status" className="border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">{state.success}</p>
        ) : null}
        {canEdit ? <FormFooter cancelHref="/settings" submitLabel="Save company details" pending={pending} /> : null}
      </form>
    </>
  )
}

/** The default text box is retired once an approved company template exists; the saved text is kept as it is. */
function ManagedTerms({ name, label, current }: { name: string; label: string; current: string }) {
  return (
    <div className="md:col-span-2 text-sm">
      <input type="hidden" name={name} value={current} />
      <p>
        {label} now come from the approved company-wide template.{' '}
        <Link href="/settings/terms" className="underline">Manage them under Commercial terms</Link>.
      </p>
    </div>
  )
}
