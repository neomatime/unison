// Shapes shared by the queries, the actions and the components. No directive and no imports.

/** What every action returns to useActionState. */
export type ActionState = { error?: string; success?: string } | undefined

/** One row of organization_settings, as the database returns it (numerics may arrive as strings). */
export type CompanySettings = {
  legal_name: string | null
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
  document_prefix: string | null
  vat_rate: number | string
  default_quote_terms: string | null
  default_payment_terms: string | null
  quote_closing_text: string | null
  invoice_closing_text: string | null
  default_quote_valid_days: number
  default_payment_days: number
  logo_path: string | null
  header_image_path: string | null
}

export type PriceItem = {
  id: string
  title: string
  description: string | null
  unit_price: number | string
  vat_code: string
  archived_at: string | null
  rate_key: string | null
  item_kind: string | null
  credits: number | string | null
  initiative_limit: number | null
  rate_status: string | null
}

export type DocumentLine = {
  id: string
  position: number
  title: string
  description: string | null
  quantity: number | string
  unit_price: number | string
  vat_code: string
  line_amount: number | string
  price_list_item_id: string | null
  rate_locked: boolean
}
