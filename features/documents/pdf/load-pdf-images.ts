// Reads the logo and header images a PDF draws from the app's own /brand folder. The company details store
// only a path, and the document view lets only "/brand/<file>" through; it is checked again here because this
// reads the disk. A missing or unusable file is an error: a PDF is never silently drawn without its header.
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import type { PdfImage, PdfImages } from './render-document-pdf.ts'
import type { DocumentView } from '../document-view.ts'

const BRAND_PATH = /^\/brand\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/

// The renderer only warns when it cannot decode an image and then draws the page without it, so the bytes are
// checked here: the file must start with the signature of the format its name gives, and a PNG must end with its
// IEND chunk (a file cut off part-way through, by a failed upload or copy, does not).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_END = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

function checkImageBytes(data: Buffer, format: PdfImage['format'], path: string) {
  if (format === 'png') {
    if (!data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error(`The file is not a PNG image: ${path}`)
    if (!data.subarray(-PNG_END.length).equals(PNG_END)) throw new Error(`The PNG image is incomplete (it does not end where a PNG should): ${path}`)
  } else if (!data.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    throw new Error(`The file is not a JPEG image: ${path}`)
  }
}

async function readBrandImage(path: string | null, root: string): Promise<PdfImage | null> {
  if (!path) return null
  if (!BRAND_PATH.test(path)) throw new Error(`Not a brand image path: ${path}`)
  const extension = extname(path).toLowerCase()
  const format = extension === '.png' ? 'png' : extension === '.jpg' || extension === '.jpeg' ? 'jpg' : null
  if (!format) throw new Error(`Only PNG and JPEG images can be put on a PDF: ${path}`)
  const data = await readFile(join(root, 'public', path))
  checkImageBytes(data, format, path)
  return { data, format }
}

export async function loadPdfImages(view: Pick<DocumentView, 'headerImage' | 'logo'>, root: string = process.cwd()): Promise<PdfImages> {
  const [header, logo] = await Promise.all([readBrandImage(view.headerImage, root), readBrandImage(view.logo, root)])
  return { header, logo }
}
