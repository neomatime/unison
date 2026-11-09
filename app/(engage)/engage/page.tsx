import type { Metadata } from 'next'
import Link from 'next/link'

import { EngagementExperience } from '@/features/prospect-engagement/components/engagement-experience'
import { loadPublicEngagementContext } from '@/features/prospect-engagement/public-data'

export const metadata: Metadata = {
  title: 'Connect with HIMARK',
  description: 'Tell HIMARK what your organisation is looking to achieve.',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams
  const source = single(query.s)
  const token = source && /^[A-Za-z0-9_-]{8,32}$/.test(source) ? source : null
  if (source && !token) return <Unavailable />

  let context = null
  try {
    context = await loadPublicEngagementContext(token)
  } catch (error) {
    console.error('[prospect-engagement] public configuration unavailable', { message: error instanceof Error ? error.message : '' })
  }
  if (!context) return <Unavailable />

  return (
    <EngagementExperience
      context={context}
      attribution={{
        source: single(query.utm_source),
        medium: single(query.utm_medium),
        campaign: single(query.utm_campaign),
        term: single(query.utm_term),
        content: single(query.utm_content),
      }}
    />
  )
}

function single(value: string | string[] | undefined) {
  return typeof value === 'string' ? value.slice(0, 160) : ''
}

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f8fd] px-5 py-16 text-[#0d2340]">
      <section className="w-full max-w-xl border border-[#d9e5f3] bg-white p-10 text-center shadow-[0_24px_70px_-42px_rgba(13,35,64,0.45)]">
        <p className="text-sm tracking-[0.36em] uppercase">HIMARK</p>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.03em]">This engagement link is unavailable.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#52667f]">The link may have expired or the service may be temporarily unavailable. You can still connect with HIMARK directly.</p>
        <Link href="https://himark.co.za" className="mt-8 inline-flex bg-[#0877c9] px-6 py-3 text-sm font-semibold tracking-[0.12em] text-white uppercase">Return to HIMARK</Link>
      </section>
    </main>
  )
}

