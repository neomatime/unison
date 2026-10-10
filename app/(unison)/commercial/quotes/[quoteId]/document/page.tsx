import Link from 'next/link'
import { notFound } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { DocumentSheet } from '@/features/documents/components/document-sheet'
import { PrintButton } from '@/features/documents/components/print-button'
import { buildDocumentView } from '@/features/documents/document-view'
import { getDocument } from '@/features/documents/queries/get-document'
import { isUuid } from '@/lib/utils'

export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  if (!isUuid(quoteId)) notFound()
  const bundle = await getDocument('quote', quoteId)
  if (!bundle) notFound()
  const view = buildDocumentView({ kind: 'quote', ...bundle })
  return (
    <WorkPage
      category="Commercial"
      title={view.number ?? 'Draft quote'}
      description="The quote as the client will see it."
      parent={{ label: 'Quote', href: `/commercial/quotes/${quoteId}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {view.draft ? 'This is a draft. Its number, its date, the VAT rate and the copies of the client and company details are fixed when it is sent.' : 'This is the frozen copy that was sent.'}
          {view.issuerMissing ? (
            <>
              {' '}
              <Link href="/settings/company" className="font-semibold text-brand hover:underline">Fill in the company details</Link> to complete the header.
            </>
          ) : null}
        </p>
        <PrintButton />
      </div>
      <div className="overflow-x-auto"><DocumentSheet view={view} /></div>
    </WorkPage>
  )
}
