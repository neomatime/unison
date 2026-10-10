// Pure readers for the document forms, so the validation the server actions depend on is unit
// testable. Relative imports only: Node's test runner cannot resolve '@/', and 'use server'
// modules cannot be imported by a test.
import { isUuid } from '../../lib/utils/index.ts'
import { VAT_CODES, type VatCode } from './vocabulary.ts'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || null
const isOneOf = (options: readonly string[], candidate: string) => options.includes(candidate)

const BRAND_PATH = /^\/brand\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/
const PREFIX = /^[A-Z0-9]{2,8}$/

/** "1500", "99.50", "1 200,5" -> a number and how many decimals were typed; null when it is not a plain non-negative decimal. */
export function parseDecimal(raw: string): { value: number; decimals: number } | null {
  const squeezed = raw.replace(/\s/g, '')
  // "1,200" is almost certainly a thousands separator, and reading it as 1.2 would be a 1000x error: refuse it.
  if (/^\d+,\d{3}$/.test(squeezed)) return null
  const cleaned = squeezed.replace(',', '.')
  if (!/^\d{1,12}(\.\d+)?$/.test(cleaned)) return null
  return { value: Number(cleaned), decimals: cleaned.includes('.') ? cleaned.split('.')[1].length : 0 }
}

type Failure = { error: string }

function readMoney(form: FormData, key: string, label: string): number | Failure {
  const parsed = parseDecimal(value(form, key))
  if (!parsed) return { error: `Enter a ${label} as a plain number, for example 1500 or 99.50 (no thousands separators).` }
  if (parsed.decimals > 2) return { error: `The ${label} can have at most 2 decimals.` }
  if (parsed.value > 9999999.99) return { error: `The ${label} is too large.` }
  return parsed.value
}

function readVatCode(form: FormData): VatCode | Failure {
  const code = value(form, 'vatCode')
  return isOneOf(VAT_CODES, code) ? (code as VatCode) : { error: 'Choose Standard rate or Zero-rated VAT.' }
}

export type LineFields = {
  title: string
  description: string | null
  quantity: number
  unit_price: number
  vat_code: VatCode
  price_list_item_id: string | null
}

export function readLineFields(form: FormData): LineFields | Failure {
  const title = value(form, 'title')
  if (!title) return { error: 'A title is required.' }
  if (title.length > 200) return { error: 'The title is too long (200 characters at most).' }
  const description = optional(form, 'description')
  if (description && description.length > 2000) return { error: 'The description is too long (2,000 characters at most).' }

  const quantity = parseDecimal(value(form, 'quantity'))
  if (!quantity) return { error: 'Enter a quantity as a plain number, for example 1 or 2.5 (a dot or comma for decimals, no thousands separators).' }
  if (quantity.decimals > 3) return { error: 'The quantity can have at most 3 decimals.' }
  if (quantity.value <= 0) return { error: 'Quantity must be more than zero.' }
  if (quantity.value > 99999.999) return { error: 'The quantity is too large.' }

  const price = readMoney(form, 'unitPrice', 'unit price')
  if (typeof price !== 'number') return price
  const vat = readVatCode(form)
  if (typeof vat !== 'string') return vat
  const itemId = optional(form, 'priceListItemId')
  if (itemId && !isUuid(itemId)) return { error: 'That price list item is not valid.' }
  return { title, description, quantity: quantity.value, unit_price: price, vat_code: vat, price_list_item_id: itemId }
}

export type PriceItemFields = { title: string; description: string | null; unit_price: number; vat_code: VatCode }

export function readPriceItemFields(form: FormData): PriceItemFields | Failure {
  const title = value(form, 'title')
  if (!title) return { error: 'A title is required.' }
  if (title.length > 200) return { error: 'The title is too long (200 characters at most).' }
  const description = optional(form, 'description')
  if (description && description.length > 2000) return { error: 'The description is too long (2,000 characters at most).' }
  const price = readMoney(form, 'unitPrice', 'unit price')
  if (typeof price !== 'number') return price
  const vat = readVatCode(form)
  if (typeof vat !== 'string') return vat
  return { title, description, unit_price: price, vat_code: vat }
}

export type CompanyFields = {
  legal_name: string
  tagline: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  website: string | null
  bank_name: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_branch_code: string | null
  bank_account_type: string | null
  document_prefix: string
  vat_rate: number
  default_quote_terms: string | null
  default_payment_terms: string | null
  quote_closing_text: string | null
  invoice_closing_text: string | null
  default_quote_valid_days: number
  default_payment_days: number
  logo_path: string | null
  header_image_path: string | null
}

type TextSpec = { key: string; column: keyof CompanyFields; label: string; max: number }

const TEXT_FIELDS: readonly TextSpec[] = [
  { key: 'tagline', column: 'tagline', label: 'Tagline', max: 120 },
  { key: 'addressLine1', column: 'address_line1', label: 'Address line 1', max: 120 },
  { key: 'addressLine2', column: 'address_line2', label: 'Address line 2', max: 120 },
  { key: 'city', column: 'city', label: 'City', max: 80 },
  { key: 'postalCode', column: 'postal_code', label: 'Postal code', max: 20 },
  { key: 'country', column: 'country', label: 'Country', max: 80 },
  { key: 'vatNumber', column: 'vat_number', label: 'VAT number', max: 40 },
  { key: 'phone', column: 'phone', label: 'Phone', max: 40 },
  { key: 'website', column: 'website', label: 'Website', max: 200 },
  { key: 'bankName', column: 'bank_name', label: 'Bank', max: 100 },
  { key: 'bankAccountName', column: 'bank_account_name', label: 'Account name', max: 100 },
  { key: 'bankAccountNumber', column: 'bank_account_number', label: 'Account number', max: 40 },
  { key: 'bankBranchCode', column: 'bank_branch_code', label: 'Branch code', max: 20 },
  { key: 'bankAccountType', column: 'bank_account_type', label: 'Account type', max: 40 },
  { key: 'defaultQuoteTerms', column: 'default_quote_terms', label: 'Default quote terms', max: 5000 },
  { key: 'defaultPaymentTerms', column: 'default_payment_terms', label: 'Default payment terms', max: 5000 },
  { key: 'quoteClosingText', column: 'quote_closing_text', label: 'Quote closing text', max: 1000 },
  { key: 'invoiceClosingText', column: 'invoice_closing_text', label: 'Invoice closing text', max: 1000 },
]

function readInteger(form: FormData, key: string, min: number, max: number, message: string): number | Failure {
  const raw = value(form, key)
  if (!/^\d{1,4}$/.test(raw)) return { error: message }
  const parsed = Number(raw)
  return parsed < min || parsed > max ? { error: message } : parsed
}

export function readCompanyFields(form: FormData): CompanyFields | Failure {
  const legalName = value(form, 'legalName')
  if (!legalName) return { error: 'The company name is required.' }
  if (legalName.length > 200) return { error: 'The company name is too long (200 characters at most).' }
  const prefix = value(form, 'documentPrefix').toUpperCase()
  if (!PREFIX.test(prefix) || prefix === 'DRAFT') return { error: 'Use 2 to 8 letters or numbers for the document prefix (not DRAFT).' }
  const rate = parseDecimal(value(form, 'vatRate'))
  if (!rate || rate.decimals > 2 || rate.value > 100) return { error: 'Enter the VAT rate as a percentage between 0 and 100, for example 15.' }
  const validDays = readInteger(form, 'defaultQuoteValidDays', 1, 365, 'A quote must be valid for between 1 and 365 days.')
  if (typeof validDays !== 'number') return validDays
  const paymentDays = readInteger(form, 'defaultPaymentDays', 0, 365, 'Payment days must be between 0 and 365.')
  if (typeof paymentDays !== 'number') return paymentDays
  const email = optional(form, 'email')
  if (email && email.length > 200) return { error: 'The company email is too long.' }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid company email.' }
  const logo = optional(form, 'logoPath')
  const header = optional(form, 'headerImagePath')
  for (const path of [logo, header]) {
    if (path && !BRAND_PATH.test(path)) return { error: 'Image paths must be a file in /brand, for example /brand/banner.png.' }
  }

  const result: Record<string, unknown> = {
    legal_name: legalName, email, document_prefix: prefix, vat_rate: rate.value,
    default_quote_valid_days: validDays, default_payment_days: paymentDays, logo_path: logo, header_image_path: header,
  }
  for (const spec of TEXT_FIELDS) {
    const text = optional(form, spec.key)
    if (text && text.length > spec.max) return { error: `${spec.label} is too long (${spec.max.toLocaleString('en-ZA')} characters at most).` }
    result[spec.column] = text
  }
  return result as CompanyFields
}

export type DocumentExtras = {
  project_name: string | null
  project_description: string | null
  project_ref: string | null
  client_ref: string | null
}

export function readDocumentExtras(form: FormData): DocumentExtras | Failure {
  const limits: Array<[key: string, column: keyof DocumentExtras, label: string, max: number]> = [
    ['projectName', 'project_name', 'The project name', 200],
    ['projectDescription', 'project_description', 'The project description', 2000],
    ['projectRef', 'project_ref', 'The project reference', 100],
    ['clientRef', 'client_ref', 'The client reference', 100],
  ]
  const result: DocumentExtras = { project_name: null, project_description: null, project_ref: null, client_ref: null }
  for (const [key, column, label, max] of limits) {
    const text = optional(form, key)
    if (text && text.length > max) return { error: `${label} is too long (${max.toLocaleString('en-ZA')} characters at most).` }
    result[column] = text
  }
  return result
}
