import type React from 'react'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { application } from '@/config/constants'
import '@/styles/globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: `${application.name} — ${application.description}`,
  description:
    `${application.name} is a unified business performance platform. ${application.tagline}`,
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-background font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
