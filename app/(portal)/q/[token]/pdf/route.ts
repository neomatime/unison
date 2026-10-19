import { NextResponse } from 'next/server'

import { makeDocumentPdf } from '@/features/documents/pdf/make-document-pdf'
import { PDF_FAILED_MESSAGE } from '@/features/quote-portal/copy'
import { toDocumentBundle } from '@/features/quote-portal/to-bundle'
import { getPortalQuote } from '@/lib/quote-portal/portal-client'
import { isPortalToken } from '@/lib/quote-portal/token'
import { isViewableQuote, type PortalQuote } from '@/lib/quote-portal/types'

export const runtime = 'nodejs'
// Read live on every request: the answer depends on the quote's state right now.
export const dynamic = 'force-dynamic'

// One answer for everything that is not a readable quote (a malformed token, an unknown or revoked link, an expired or
// replaced quote), so the response says nothing about why.
const NOT_FOUND = { message: 'That quotation was not found.' }

/**
 * Every other failure (the quote could not be read, the PDF could not be drawn) is the same generic answer to the
 * client: the real error can name fonts, image files or company details, which are not theirs to see. It is logged here
 * instead. Only the message of an error is logged: the errors of portal-client are built without the token, and nothing
 * that holds the token is ever passed to the renderer.
 */
function pdfFailed(error: unknown): NextResponse {
  console.error('[quote-portal:pdf]', error instanceof Error ? error.message : 'unknown error')
  return NextResponse.json({ message: PDF_FAILED_MESSAGE }, { status: 500 })
}

/**
 * The PDF of the quote a link points at: the same frozen quote the page shows, drawn by the same code as the emailed
 * attachment. Only a quote the client can read has one. Reading it changes nothing: it does not mark the quote as opened.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isPortalToken(token)) return NextResponse.json(NOT_FOUND, { status: 404 })

  let quote: PortalQuote
  try {
    quote = await getPortalQuote(token)
  } catch (error) {
    return pdfFailed(error)
  }
  if (!isViewableQuote(quote)) return NextResponse.json(NOT_FOUND, { status: 404 })

  try {
    const { bytes, filename } = await makeDocumentPdf('quote', toDocumentBundle(quote))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    return pdfFailed(error)
  }
}
