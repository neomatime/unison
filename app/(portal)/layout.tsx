import type { Metadata } from 'next'
import type React from 'react'

// The client-facing quote portal. It sits inside the root layout (the html and body) and adds nothing around the page
// but a main: no sidebar, no staff menu, no sign-in. The address is the credential, so the pages are also kept out of
// search indexes (the response headers say the same in next.config.mjs).
//
// The description and generator are set here, not left to the root layout: this page is what Slack, Teams or WhatsApp
// show when a client pastes the link, and it must not say anything about the platform behind it.
export const metadata: Metadata = {
  title: 'Your quotation | HIMARK',
  description: 'Your quotation from HIMARK.',
  generator: null,
  robots: { index: false, follow: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-background text-foreground">{children}</main>
}
