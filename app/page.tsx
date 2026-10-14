import type { Metadata } from 'next'

import { LandingPage } from '@/features/marketing/components/landing-page'

export const metadata: Metadata = {
  title: 'UNISON — Client Relationship Management',
  description: 'UNISON brings leads, clients, quotes, invoices and client files into one calm workspace, so your whole team knows where every relationship stands.',
}

export default function HomePage() {
  return <LandingPage />
}
