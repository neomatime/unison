import type { ReactNode } from 'react'

import { parseBlocks, type Inline } from '../description'

function inline(parts: Inline[]): ReactNode[] {
  return parts.map((part, index) =>
    part.kind === 'text' ? (
      part.text
    ) : part.kind === 'bold' ? (
      <strong key={index} className="font-semibold">{part.text}</strong>
    ) : (
      <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline">{part.text}</a>
    ),
  )
}

/** A description drawn from its blocks as React elements: never raw HTML, so what was typed cannot become markup. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm break-words text-foreground">
      {parseBlocks(text).map((block, index) =>
        block.kind === 'p' ? (
          <p key={index}>{block.lines.map((line, i) => <span key={i}>{i ? <br /> : null}{inline(line)}</span>)}</p>
        ) : block.kind === 'ul' ? (
          <ul key={index} className="list-disc space-y-1 pl-5">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>
        ) : (
          <ol key={index} className="list-decimal space-y-1 pl-5">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ol>
        ),
      )}
    </div>
  )
}
