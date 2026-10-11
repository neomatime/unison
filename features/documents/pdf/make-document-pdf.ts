import 'server-only'

import { buildDocumentView, type DocumentView } from '../document-view'
import type { DocumentBundle } from '../queries/get-document'
import type { DocumentKind } from '../vocabulary'
import { loadPdfImages } from './load-pdf-images'
import { pdfFileName } from './pdf-text'
import { renderDocumentPdf } from './render-document-pdf'

/** A failure whose message is safe to show to the person who asked for the PDF. */
export class DocumentPdfError extends Error {}

export async function makeDocumentPdf(kind: DocumentKind, bundle: DocumentBundle): Promise<{ bytes: Buffer; filename: string; view: DocumentView }> {
  const view = buildDocumentView({ kind, ...bundle })
  if (view.draft || !view.number) throw new DocumentPdfError('Send or issue this document before making its PDF.')
  let images: Awaited<ReturnType<typeof loadPdfImages>>
  try {
    images = await loadPdfImages(view)
  } catch (error) {
    console.error('[documents:pdf] images', error)
    throw new DocumentPdfError('The PDF could not be made. Check that the logo and header image files named in the company details exist and are complete PNG or JPEG files.')
  }
  try {
    const bytes = await renderDocumentPdf(view, images)
    return { bytes, filename: `${pdfFileName(view.number)}.pdf`, view }
  } catch (error) {
    console.error('[documents:pdf] render', error)
    throw new DocumentPdfError('The PDF could not be made. Try again, and if it keeps failing, report the document number.')
  }
}
