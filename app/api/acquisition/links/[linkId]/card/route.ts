import { NextResponse } from 'next/server'

import { getAcquisitionAssetData } from '@/features/prospect-engagement/asset-data'
import { engagementCardPdf, engagementCardPng, engagementCardSvg } from '@/features/prospect-engagement/assets'
import { isUuid } from '@/lib/utils'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params
  if (!isUuid(linkId)) return new NextResponse('Not found', { status: 404 })
  const asset = await getAcquisitionAssetData(linkId)
  if (!asset) return new NextResponse('Not found', { status: 404 })
  const query = new URL(request.url).searchParams
  const requested = query.get('format')
  const format = requested === 'png' || requested === 'pdf' ? requested : 'svg'
  const download = query.get('download') === '1'
  const body = format === 'png'
    ? await engagementCardPng(asset.url, asset.printReady)
    : format === 'pdf'
      ? await engagementCardPdf(asset.url, asset.printReady)
      : Buffer.from(await engagementCardSvg(asset.url, asset.printReady))
  const type = format === 'png' ? 'image/png' : format === 'pdf' ? 'application/pdf' : 'image/svg+xml; charset=utf-8'
  return new NextResponse(new Uint8Array(body), { headers: {
    'Content-Type': type,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="himark-${safeName(asset.name)}-engagement-card.${format}"`,
    'Cache-Control': 'private, no-store',
    'X-UNISON-Print-Ready': asset.printReady ? 'true' : 'false',
  } })
}

function safeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'engagement' }

