import { notFound } from 'next/navigation'

import { AutoPrint } from '@/features/documents/components/auto-print'
import { DocumentSheet } from '@/features/documents/components/document-sheet'
import { buildDocumentView } from '@/features/documents/document-view'
import { getDocument } from '@/features/documents/queries/get-document'
import { isUuid } from '@/lib/utils'

// A bare page for printing or saving the invoice as a PDF: no app shell around the sheet, so the sheet fills the whole paper
// whatever the paper size, and the print dialog opens by itself once the pictures have loaded.
export default async function Page({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  if (!isUuid(invoiceId)) notFound()
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) notFound()
  const view = buildDocumentView({ kind: 'invoice', ...bundle })
  return (
    <main className="min-h-screen bg-[#e9edf2] py-6 print:bg-white print:py-0">
      <DocumentSheet view={view} />
      <AutoPrint />
    </main>
  )
}
