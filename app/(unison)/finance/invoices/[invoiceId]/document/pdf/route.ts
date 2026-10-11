import { documentPdfResponse } from '@/features/documents/pdf/pdf-response'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return documentPdfResponse('invoice', invoiceId)
}
