// An event's description and agenda. Pure: no directive, no imports, so the tests load it directly.
//
// The description is plain text that may use a little formatting, so nothing unsafe is ever stored or rendered as HTML:
//   **bold**   [text](https://link)   a bare https:// link   "- " or "* " bullets   "1. " numbered lines
// It is read into blocks here; the page draws the blocks as React elements, and toHtml() writes the same blocks as escaped
// HTML for the Teams invitation.

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string }
export type Block = { kind: 'p'; lines: Inline[][] } | { kind: 'ul' | 'ol'; items: Inline[][] }

const INLINE = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g

export function parseInline(line: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  const push = (text: string) => {
    if (text) out.push({ kind: 'text', text })
  }
  for (const match of line.matchAll(INLINE)) {
    push(line.slice(last, match.index))
    if (match[1] !== undefined) out.push({ kind: 'bold', text: match[1] })
    else if (match[3] !== undefined) out.push({ kind: 'link', text: match[2], href: match[3] })
    else {
      // A bare link does not own the punctuation that ends the sentence.
      const trailing = /[.,;:!?)]+$/.exec(match[4])?.[0] ?? ''
      const href = match[4].slice(0, match[4].length - trailing.length)
      out.push({ kind: 'link', text: href, href })
      push(trailing)
    }
    last = (match.index ?? 0) + match[0].length
  }
  push(line.slice(last))
  return out
}

export function parseBlocks(text: string | null | undefined): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null
  const close = () => {
    if (current) blocks.push(current)
    current = null
  }
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (!line.trim()) {
      close()
    } else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol'
      if (!current || current.kind !== kind) {
        close()
        current = { kind, items: [] }
      }
      current.items.push(parseInline((bullet ?? numbered)![1]))
    } else {
      if (!current || current.kind !== 'p') {
        close()
        current = { kind: 'p', lines: [] }
      }
      current.lines.push(parseInline(line))
    }
  }
  close()
  return blocks
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const inlineHtml = (parts: Inline[]) =>
  parts
    .map((part) => (part.kind === 'text' ? escapeHtml(part.text) : part.kind === 'bold' ? `<strong>${escapeHtml(part.text)}</strong>` : `<a href="${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`))
    .join('')

export function toHtml(text: string | null | undefined): string {
  return parseBlocks(text)
    .map((block) => (block.kind === 'p' ? `<p>${block.lines.map(inlineHtml).join('<br>')}</p>` : `<${block.kind}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${block.kind}>`))
    .join('')
}

// ---- Agenda -----------------------------------------------------------------------------------------------------

export type AgendaItem = { title: string; minutes: number | null }
export const MAX_AGENDA_ITEMS = 20

/** Reads an agenda from JSON text or an array: items without a title are dropped, minutes must be a whole 1-600, and there are at most 20. */
export function parseAgenda(value: unknown): AgendaItem[] {
  let list: unknown = value
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const items: AgendaItem[] = []
  for (const entry of list) {
    const record = (entry && typeof entry === 'object' ? entry : {}) as { title?: unknown; minutes?: unknown }
    const title = typeof record.title === 'string' ? record.title.trim().slice(0, 200) : ''
    if (!title) continue
    const minutes = Number(record.minutes)
    items.push({ title, minutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 600 ? minutes : null })
    if (items.length === MAX_AGENDA_ITEMS) break
  }
  return items
}

export const agendaMinutes = (items: readonly AgendaItem[]): number => items.reduce((sum, item) => sum + (item.minutes ?? 0), 0)

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function agendaHtml(items: readonly AgendaItem[]): string {
  if (!items.length) return ''
  return `<p><strong>Agenda</strong></p><ol>${items.map((item) => `<li>${escapeHtml(item.title)}${item.minutes ? ` (${formatMinutes(item.minutes)})` : ''}</li>`).join('')}</ol>`
}

/** The body of the Teams invitation: the description, then the agenda. */
export const invitationHtml = (description: string | null | undefined, agenda: readonly AgendaItem[]): string => toHtml(description) + agendaHtml(agenda)
