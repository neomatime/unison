import type React from 'react'
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { application } from '@/config/constants'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: `${application.name} — ${application.description}`,
  description:
    `${application.name} is a governed enterprise project delivery system. ${application.tagline}`,
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
      <body className="bg-background font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
