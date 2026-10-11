import Link from 'next/link'
import { notFound } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { DocumentSheet } from '@/features/documents/components/document-sheet'
import { PrintButton } from '@/features/documents/components/print-button'
import { buildDocumentView } from '@/features/documents/document-view'
import { getDocument } from '@/features/documents/queries/get-document'
import { isUuid } from '@/lib/utils'

export default async function Page({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  if (!isUuid(invoiceId)) notFound()
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) notFound()
  const view = buildDocumentView({ kind: 'invoice', ...bundle })
  return (
    <WorkPage
      category="Finance"
      title={view.number ?? 'Draft invoice'}
      description="The invoice as the client will see it."
      parent={{ label: 'Invoice', href: `/finance/invoices/${invoiceId}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {view.draft ? 'This is a draft. Its number, its date, the VAT rate and the copies of the client and company details are fixed when it is issued.' : 'This is the frozen copy that was issued.'}
          {view.issuerMissing ? (
            <>
              {' '}
              <Link href="/settings/company" className="font-semibold text-brand hover:underline">Fill in the company details</Link> to complete the header.
            </>
          ) : null}
        </p>
        <PrintButton href={`/print/invoice/${invoiceId}`} />
      </div>
      <div className="overflow-x-auto"><DocumentSheet view={view} /></div>
    </WorkPage>
  )
}
