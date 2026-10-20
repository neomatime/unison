/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // react-pdf has to load the ordinary build of React, not the server-components build that route handlers bundle.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The PDF code reads the brand images from disk, which the file tracer cannot see, so the functions that draw a
  // PDF are told to ship them. A server action runs in its page's function, so the pages are listed as well as
  // the download routes. The keys are globs matched against the route path without its (unison) group, so the
  // brackets of a dynamic segment are escaped: unescaped, "[quoteId]" is a character class and matches nothing.
  // Checked against the built .nft.json files.
  outputFileTracingIncludes: {
    '/commercial/quotes/\\[quoteId\\]': ['./public/brand/**/*'],
    '/commercial/quotes/\\[quoteId\\]/document/pdf': ['./public/brand/**/*'],
    '/finance/invoices/\\[invoiceId\\]': ['./public/brand/**/*'],
    '/finance/invoices/\\[invoiceId\\]/document/pdf': ['./public/brand/**/*'],
    // The client's PDF download in the quote portal.
    '/q/\\[token\\]/pdf': ['./public/brand/**/*'],
  },
  // The quote portal is public and its address is its credential. These keep that address out of caches, search
  // indexes, referrer headers and frames. "/q/:path*" matches /q as well as everything under it.
  async headers() {
    return [
      {
        source: '/q/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/sign-up',
        destination: '/sign-in',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
