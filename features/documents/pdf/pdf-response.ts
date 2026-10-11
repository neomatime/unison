import 'server-only'

import { NextResponse } from 'next/server'

import { NotAuthenticatedError } from '@/lib/auth/errors'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { isUuid } from '@/lib/utils'
import { getDocument } from '../queries/get-document'
import { isDraftStatus, type DocumentKind } from '../vocabulary'
import { DocumentPdfError, makeDocumentPdf } from './make-document-pdf'

const NOT_FOUND = { message: 'That document was not found.' }

/** The body of a download route: the PDF of a sent quote or an issued invoice, for a signed-in member of its organisation. */
export async function documentPdfResponse(kind: DocumentKind, id: string): Promise<Response> {
  if (!isUuid(id)) return NextResponse.json(NOT_FOUND, { status: 404 })
  try {
    await getSessionContext()
  } catch (error) {
    if (error instanceof NotAuthenticatedError) return NextResponse.json({ message: 'Sign in to download this document.' }, { status: 401 })
    throw error
  }
  const bundle = await getDocument(kind, id)
  if (!bundle) return NextResponse.json(NOT_FOUND, { status: 404 })
  // A draft has no PDF: it keeps the on-screen preview and print. Answered as not found, like another organisation's document.
  if (isDraftStatus(kind, bundle.record.status)) return NextResponse.json(NOT_FOUND, { status: 404 })
  try {
    const { bytes, filename } = await makeDocumentPdf(kind, bundle)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof DocumentPdfError) return NextResponse.json({ message: error.message }, { status: 500 })
    throw error
  }
}
