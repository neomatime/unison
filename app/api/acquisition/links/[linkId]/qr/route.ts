import { NextResponse } from 'next/server'

import { getAcquisitionAssetData } from '@/features/prospect-engagement/asset-data'
import { qrPng, qrSvg } from '@/features/prospect-engagement/assets'
import { isUuid } from '@/lib/utils'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params
  if (!isUuid(linkId)) return new NextResponse('Not found', { status: 404 })
  const asset = await getAcquisitionAssetData(linkId)
  if (!asset) return new NextResponse('Not found', { status: 404 })
  const query = new URL(request.url).searchParams
  const format = query.get('format') === 'png' ? 'png' : 'svg'
  const download = query.get('download') === '1'
  const body = format === 'png' ? await qrPng(asset.url) : Buffer.from(await qrSvg(asset.url))
  return new NextResponse(new Uint8Array(body), { headers: {
    'Content-Type': format === 'png' ? 'image/png' : 'image/svg+xml; charset=utf-8',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="himark-${safeName(asset.name)}-qr.${format}"`,
    'Cache-Control': 'private, no-store',
  } })
}

function safeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'engagement' }

