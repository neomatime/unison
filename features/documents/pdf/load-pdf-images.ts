// Reads the logo and header images a PDF draws from the app's own /brand folder. The company details store
// only a path, and the document view lets only "/brand/<file>" through; it is checked again here because this
// reads the disk. A missing or unusable file is an error: a PDF is never silently drawn without its header.
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import type { PdfImage, PdfImages } from './render-document-pdf.ts'
import type { DocumentView } from '../document-view.ts'

const BRAND_PATH = /^\/brand\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/

async function readBrandImage(path: string | null, root: string): Promise<PdfImage | null> {
  if (!path) return null
  if (!BRAND_PATH.test(path)) throw new Error(`Not a brand image path: ${path}`)
  const extension = extname(path).toLowerCase()
  const format = extension === '.png' ? 'png' : extension === '.jpg' || extension === '.jpeg' ? 'jpg' : null
  if (!format) throw new Error(`Only PNG and JPEG images can be put on a PDF: ${path}`)
  return { data: await readFile(join(root, 'public', path)), format }
}

export async function loadPdfImages(view: Pick<DocumentView, 'headerImage' | 'logo'>, root: string = process.cwd()): Promise<PdfImages> {
  const [header, logo] = await Promise.all([readBrandImage(view.headerImage, root), readBrandImage(view.logo, root)])
  return { header, logo }
}
