'use client'

import { Clipboard, MoreHorizontal, Users } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'

export function OrganizationMenu({ organizationId }: { organizationId: string }) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [copied, setCopied] = useState(false)

  async function copyOrganizationId() {
    try {
      await navigator.clipboard.writeText(organizationId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2400)
    } finally {
      menuRef.current?.removeAttribute('open')
    }
  }

  return (
    <details ref={menuRef} className="relative">
      <summary
        aria-label="More organisation actions"
        className="flex size-10 cursor-pointer list-none items-center justify-center border border-border bg-card text-muted-foreground transition-colors marker:content-none hover:border-muted-foreground/45 hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <MoreHorizontal className="size-5" />
      </summary>
      <div role="menu" className="unison-menu-enter absolute top-full right-0 z-40 mt-1 w-52 border border-border bg-card p-1.5 shadow-xl">
        <button
          type="button"
          role="menuitem"
          onClick={copyOrganizationId}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
        >
          <Clipboard className="size-3.5" />
          {copied ? 'Organisation ID copied' : 'Copy organisation ID'}
        </button>
        <Link
          href="/people/team"
          role="menuitem"
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
        >
          <Users className="size-3.5" />
          View Team
        </Link>
      </div>
    </details>
  )
}
