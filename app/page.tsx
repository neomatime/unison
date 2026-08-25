import type { Metadata } from 'next'

import { LandingPage } from '@/features/marketing/components/landing-page'

export const metadata: Metadata = {
  title: 'UNISON — Governed Enterprise Project Delivery',
  description: 'UNISON brings frameworks, portfolio visibility, approvals and vendor governance into one enterprise project delivery system.',
}

export default function HomePage() {
  return <LandingPage />
}
