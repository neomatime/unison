import { Children, Fragment, isValidElement, type ReactNode } from 'react'

/**
 * The pure half of the shared dropdown: reading `<option>` children and
 * filtering them. Kept free of components so it can be unit tested with node.
 */

export type SelectOption = { value: string; label: string; disabled: boolean; group: string | null }

/** Lists up to this many options hide the search box; longer ones show it. */
export const SEARCH_THRESHOLD = 5

export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

/** Flattens `<option>`, `<optgroup>` and fragments (including mapped arrays) into one ordered list. */
export function readOptions(children: ReactNode, group: string | null = null): SelectOption[] {
  const found: SelectOption[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as {
      value?: string | number
      label?: string
      disabled?: boolean
      children?: ReactNode
    }
    if (child.type === Fragment) {
      found.push(...readOptions(props.children, group))
    } else if (child.type === 'optgroup') {
      found.push(...readOptions(props.children, props.label ?? ''))
    } else if (child.type === 'option') {
      const label = textOf(props.children) || props.label || ''
      found.push({
        value: props.value === undefined ? label : String(props.value),
        label,
        disabled: Boolean(props.disabled),
        group,
      })
    }
  })
  return found
}

export function shouldShowSearch(optionCount: number, threshold: number = SEARCH_THRESHOLD): boolean {
  return optionCount > threshold
}

export function filterOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...options]
  return options.filter((option) => option.label.toLowerCase().includes(needle) || option.group?.toLowerCase().includes(needle))
}

/** The option a closed dropdown should display; the first option when the value matches none, as a native select does. */
export function selectedOption(options: readonly SelectOption[], value: string): SelectOption | null {
  return options.find((option) => option.value === value) ?? null
}

/** Next enabled option index in `step` direction, wrapping; -1 when nothing is selectable. */
export function nextEnabledIndex(options: readonly SelectOption[], from: number, step: 1 | -1): number {
  if (options.length === 0) return -1
  for (let i = 1; i <= options.length; i += 1) {
    const index = (((from + step * i) % options.length) + options.length) % options.length
    if (!options[index].disabled) return index
  }
  return -1
}
