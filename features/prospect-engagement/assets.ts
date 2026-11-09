import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import sharp from 'sharp'

import { qrPng, qrSvg } from './qr-code'

export { qrPng, qrSvg } from './qr-code'

export async function engagementCardSvg(url: string, printReady: boolean) {
  const qr = await qrSvg(url)
  const qrInner = qr.replace(/^.*?<svg[^>]*>/s, '').replace(/<\/svg>\s*$/s, '')
  const qrViewBox = qr.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 41 41'
  const logo = await brandWordmarkDataUrl()
  const escapedUrl = escapeXml(displayUrl(url))
  const proof = printReady ? '' : '<text x="480" y="535" text-anchor="middle" class="proof">PREVIEW — CONFIGURE THE LIVE PUBLIC URL BEFORE PRINTING</text>'
  const backProof = printReady ? '' : '<text x="1440" y="535" text-anchor="middle" class="proof">PREVIEW — NOT PRINT READY</text>'
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="192mm" height="56mm" viewBox="0 0 1920 560">
  <title>HIMARK engagement card — front and back with 3 mm bleed</title>
  <defs>
    <linearGradient id="front" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#edf6ff"/></linearGradient>
    <linearGradient id="back" x1="0" x2="1"><stop stop-color="#0d2340"/><stop offset="1" stop-color="#124f7a"/></linearGradient>
    <style>
      .sans{font-family:Inter,Aptos,Segoe UI,sans-serif}.heading{font:600 46px Inter,Aptos,Segoe UI,sans-serif;fill:#102746;letter-spacing:-1px}.body{font:400 21px Inter,Aptos,Segoe UI,sans-serif;fill:#526a85}.backhead{font:600 31px Inter,Aptos,Segoe UI,sans-serif;fill:#fff}.backbody{font:400 18px Inter,Aptos,Segoe UI,sans-serif;fill:#c9dded}.url{font:500 15px Inter,Aptos,Segoe UI,sans-serif;fill:#fff;letter-spacing:.3px}.proof{font:600 10px Inter,Aptos,Segoe UI,sans-serif;fill:#b14949;letter-spacing:1.4px}.crop{fill:none;stroke:#65a7d6;stroke-width:1;opacity:.45}
    </style>
  </defs>
  <!-- FRONT: 960 × 560 units represents 96 × 56 mm including 3 mm bleed. Trim is x/y 30 to 930/530. -->
  <g id="front-card">
    <rect width="960" height="560" fill="url(#front)"/>
    <path d="M0 0h330L105 560H0z" fill="#dcecff" opacity=".72"/>
    <path d="M960 330v230H650z" fill="#c8e2fa" opacity=".55"/>
    <path d="M30 0v22M30 538v22M930 0v22M930 538v22M0 30h22M938 30h22M0 530h22M938 530h22" class="crop"/>
    <image x="86" y="78" width="210" height="64" preserveAspectRatio="xMinYMid meet" xlink:href="${logo}"/>
    <rect x="86" y="173" width="55" height="3" fill="#0b84cf"/>
    <text x="86" y="254" class="heading">Let’s explore a partnership.</text>
    <text x="86" y="300" class="body">Tell us what your organisation is looking to achieve.</text>
    <text x="86" y="448" class="sans" font-size="13" font-weight="600" letter-spacing="2.4" fill="#617995">HIMARK · PURPOSEFUL PARTNERSHIPS</text>
    ${proof}
  </g>
  <!-- BACK -->
  <g id="back-card" transform="translate(960 0)">
    <rect width="960" height="560" fill="url(#back)"/>
    <path d="M675 0h285v205L820 75z" fill="#1e6797" opacity=".55"/>
    <path d="M0 405L180 560H0z" fill="#0a75b9" opacity=".35"/>
    <path d="M30 0v22M30 538v22M930 0v22M930 538v22M0 30h22M938 30h22M0 530h22M938 530h22" class="crop"/>
    <rect x="84" y="75" width="330" height="330" rx="8" fill="#fff"/>
    <svg x="93" y="84" width="312" height="312" viewBox="${qrViewBox}">${qrInner}</svg>
    <text x="480" y="164" class="backhead">Scan to connect</text>
    <text x="480" y="203" class="backhead">with HIMARK.</text>
    <text x="480" y="258" class="backbody">A few quick steps.</text>
    <text x="480" y="287" class="backbody">A meaningful conversation.</text>
    <text x="480" y="355" class="url">${escapedUrl}</text>
    <rect x="480" y="382" width="52" height="3" fill="#37a4e8"/>
    ${backProof}
  </g>
</svg>`
}

export async function engagementCardPng(url: string, printReady: boolean) {
  const svg = await engagementCardSvg(url, printReady)
  return sharp(Buffer.from(svg), { density: 300 }).png({ compressionLevel: 9 }).toBuffer()
}

export async function engagementCardPdf(url: string, printReady: boolean) {
  const document = await PDFDocument.create()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const logoBytes = await readFile(path.join(process.cwd(), 'public', 'brand', 'himark-wordmark.png'))
  const logo = await document.embedPng(logoBytes)
  const qr = await document.embedPng(await qrPng(url, 1200))
  const mm = (value: number) => value * 72 / 25.4
  const width = mm(96)
  const height = mm(56)
  const navy = rgb(16 / 255, 39 / 255, 70 / 255)
  const blue = rgb(8 / 255, 119 / 255, 201 / 255)

  const front = document.addPage([width, height])
  front.drawRectangle({ x: 0, y: 0, width, height, color: rgb(245 / 255, 249 / 255, 1) })
  front.drawRectangle({ x: 0, y: 0, width: mm(18), height, color: rgb(226 / 255, 239 / 255, 253 / 255) })
  front.drawImage(logo, { x: mm(8), y: mm(41), width: mm(22), height: mm(6.3) })
  front.drawRectangle({ x: mm(8), y: mm(36.5), width: mm(6), height: mm(0.4), color: blue })
  front.drawText("Let's explore a partnership.", { x: mm(8), y: mm(27), size: 13.6, font: bold, color: navy })
  front.drawText('Tell us what your organisation is looking to achieve.', { x: mm(8), y: mm(21.5), size: 6.4, font: regular, color: rgb(.32, .42, .54) })
  front.drawText('HIMARK  ·  PURPOSEFUL PARTNERSHIPS', { x: mm(8), y: mm(8), size: 4.4, font: bold, color: rgb(.38, .48, .6) })
  if (!printReady) front.drawText('PREVIEW — NOT PRINT READY', { x: mm(8), y: mm(4), size: 4, font: bold, color: rgb(.7, .2, .2) })
  drawTrim(front, mm)

  const back = document.addPage([width, height])
  back.drawRectangle({ x: 0, y: 0, width, height, color: navy })
  back.drawRectangle({ x: mm(67), y: mm(42), width: mm(29), height: mm(14), color: rgb(.08, .29, .45), opacity: .55 })
  back.drawRectangle({ x: mm(7.5), y: mm(9.5), width: mm(33), height: mm(33), color: rgb(1, 1, 1) })
  back.drawImage(qr, { x: mm(8.3), y: mm(10.3), width: mm(31.4), height: mm(31.4) })
  back.drawText('Scan to connect', { x: mm(47), y: mm(36), size: 11, font: bold, color: rgb(1, 1, 1) })
  back.drawText('with HIMARK.', { x: mm(47), y: mm(31.5), size: 11, font: bold, color: rgb(1, 1, 1) })
  back.drawText('A few quick steps.', { x: mm(47), y: mm(24.5), size: 6, font: regular, color: rgb(.78, .87, .93) })
  back.drawText('A meaningful conversation.', { x: mm(47), y: mm(21), size: 6, font: regular, color: rgb(.78, .87, .93) })
  back.drawText(displayUrl(url), { x: mm(47), y: mm(13.5), size: 4.8, font: regular, color: rgb(1, 1, 1), maxWidth: mm(41) })
  if (!printReady) back.drawText('PREVIEW — NOT PRINT READY', { x: mm(47), y: mm(6), size: 4, font: bold, color: rgb(1, .55, .55) })
  drawTrim(back, mm)

  document.setTitle('HIMARK Engagement Card')
  document.setSubject(`Engagement card for ${url}`)
  document.setProducer('UNISON')
  return Buffer.from(await document.save())
}

async function brandWordmarkDataUrl() {
  const bytes = await readFile(path.join(process.cwd(), 'public', 'brand', 'himark-wordmark.png'))
  return `data:image/png;base64,${bytes.toString('base64')}`
}

function displayUrl(value: string) {
  const url = new URL(value)
  return `${url.host}${url.pathname}${url.search}`
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ?? character)
}

function drawTrim(page: ReturnType<PDFDocument['addPage']>, mm: (value: number) => number) {
  const color = rgb(.35, .62, .8)
  const line = (start: { x: number; y: number }, end: { x: number; y: number }) =>
    page.drawLine({ start, end, color, thickness: .25, opacity: .45 })
  for (const x of [3, 93]) {
    line({ x: mm(x), y: 0 }, { x: mm(x), y: mm(2.2) })
    line({ x: mm(x), y: mm(53.8) }, { x: mm(x), y: mm(56) })
  }
  for (const y of [3, 53]) {
    line({ x: 0, y: mm(y) }, { x: mm(2.2), y: mm(y) })
    line({ x: mm(93.8), y: mm(y) }, { x: mm(96), y: mm(y) })
  }
}

