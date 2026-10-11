import { documentPdfResponse } from '@/features/documents/pdf/pdf-response'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  return documentPdfResponse('quote', quoteId)
}
