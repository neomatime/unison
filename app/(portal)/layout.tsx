import type { Metadata } from 'next'
import type React from 'react'

// The client-facing quote portal. It sits inside the root layout (the html and body) and adds nothing around the page
// but a main: no sidebar, no staff menu, no sign-in. The address is the credential, so the pages are also kept out of
// search indexes (the response headers say the same in next.config.mjs).
export const metadata: Metadata = {
  title: 'Your quotation | HIMARK',
  robots: { index: false, follow: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-background text-foreground">{children}</main>
}
