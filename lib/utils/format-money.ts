// No imports and no '@/' alias, so Node's test runner can load this directly.

/**
 * Formats an amount as South African English currency ("R1 200", "US$40").
 *
 * `Intl` puts a no-break space between a currency symbol and the digits
 * ("R 1 200"), which in a large figure reads as a gap and as one more group of
 * digits. South African usage attaches the symbol. A code with no symbol of its
 * own ("CHF 40") keeps its space, because "CHF40" is not how anyone writes it.
 */
export function formatCurrency(amount: number, currency: string, options: Intl.NumberFormatOptions = {}): string {
  const parts = new Intl.NumberFormat('en-ZA', { style: 'currency', currency, ...options }).formatToParts(amount)
  const isSymbol = (symbol: string) => symbol !== currency.toUpperCase()
  return parts
    .filter((part, index) => !(
      part.type === 'literal'
      && parts[index - 1]?.type === 'currency'
      && isSymbol(parts[index - 1].value)
    ))
    .map((part) => part.value)
    .join('')
}
