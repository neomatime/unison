import type { MetadataRoute } from 'next'

import { application } from '@/config/constants'

// What the browser reads to offer "Install UNISON" and to run it in its own window with its own icon. The colours match the
// signed-in app's navy; the icons are the navy U (public/icons). start_url is the Overview, so a signed-out visitor lands on sign-in.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${application.name} — ${application.description}`,
    short_name: application.name,
    description: `${application.name} is HIMARK's client relationship platform for leads, clients, quotes and invoices.`,
    start_url: '/overview',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0d2340',
    theme_color: '#16202e',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
