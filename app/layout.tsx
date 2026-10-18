import type React from 'react'
import type { Metadata, Viewport } from 'next'
import { SafeAnalytics } from '@/components/shared/safe-analytics'
import { application } from '@/config/constants'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: `${application.name} — ${application.description}`,
  description:
    `${application.name} is a client relationship platform for leads, clients, quotes and invoices. ${application.tagline}`,
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#16202e',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="unison-interface bg-background font-sans antialiased">
        {children}
        <SafeAnalytics />
      </body>
    </html>
  )
}
