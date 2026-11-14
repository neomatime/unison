// Reads an import file's rows (one row per mining operation, or per organisation with no mapped site) into what
// market_import stores, and says exactly which rows were refused and why. Nothing is guessed: a row without a source, or
// an operation without a province and coordinates inside South Africa, is refused rather than filled in.
// Pure: no directive, so unit tests load it. The column list is documented in docs/market-intelligence/README.md.

import { PROVINCES, companyKey, type Province } from './model.ts'

export const IMPORT_COLUMNS = [
  'organisation_name', 'trading_name', 'parent_organisation', 'registration_number', 'website', 'organisation_type',
  'commodities', 'operation_name', 'province', 'district', 'latitude', 'longitude', 'primary_commodity',
  'other_commodities', 'operation_type', 'operating_status', 'location_accuracy', 'source', 'source_reference', 'verified_on',
] as const

export type ImportRow = {
  organization: {
    registered_name: string
    trading_name: string | null
    parent_name: string | null
    registration_number: string | null
    website: string | null
    organization_type: string | null
    commodities: string[]
    match_key: string
    source: string
    source_ref: string | null
    verified_on: string | null
  }
  operation: {
    name: string
    province: Province
    district: string | null
    latitude: number
    longitude: number
    primary_commodity: string | null
    other_commodities: string[]
    operation_type: string | null
    operating_status: string | null
    location_accuracy: 'exact' | 'approximate' | 'district'
    match_key: string
    source: string
    source_ref: string | null
    verified_on: string | null
  } | null
}

export type ImportProblem = { line: number; message: string }

const header = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const clean = (value: unknown): string | null => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 300) : null
}
const list = (value: unknown) => [...new Set((clean(value) ?? '').split(/[;|]/).map((item) => item.trim()).filter(Boolean))]

const PROVINCE_NAMES = new Map<string, Province>([
  ...PROVINCES.map((province) => [header(province), province] as const),
  ['kzn', 'KwaZulu-Natal'], ['kwazulu_natal', 'KwaZulu-Natal'], ['northwest', 'North West'], ['north_west_province', 'North West'],
])

function isoDate(value: string | null): string | null | undefined {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value
}

/**
 * Turns the file's header row and data rows into import rows. Line numbers in problems count the header as line 1,
 * as a spreadsheet does. A file missing a required column is refused as a whole.
 */
export function readImportRows(headers: string[], rows: unknown[][]): { rows: ImportRow[]; problems: ImportProblem[] } {
  const columns = headers.map(header)
  for (const required of ['organisation_name', 'source'] as const) {
    if (!columns.includes(required)) return { rows: [], problems: [{ line: 1, message: `The file has no "${required}" column.` }] }
  }
  const out: ImportRow[] = []
  const problems: ImportProblem[] = []
  rows.forEach((cells, index) => {
    const line = index + 2
    const cell = (name: (typeof IMPORT_COLUMNS)[number]) => {
      const at = columns.indexOf(name)
      return at === -1 ? null : clean(cells[at])
    }
    const name = cell('organisation_name')
    const source = cell('source')
    if (!name) return problems.push({ line, message: 'The organisation name is empty.' })
    if (!source) return problems.push({ line, message: 'Say where the row comes from (the source column).' })
    const verifiedOn = isoDate(cell('verified_on'))
    if (verifiedOn === undefined) return problems.push({ line, message: 'Write the verification date as YYYY-MM-DD.' })
    let website = cell('website')
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`
    if (website && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(website)) return problems.push({ line, message: 'The website is not a web address.' })
    const registration = cell('registration_number')
    const key = registration ? `reg:${registration.toLowerCase().replace(/\s+/g, '')}` : companyKey(name)
    if (!key) return problems.push({ line, message: 'The organisation name has no letters or digits.' })

    const organization: ImportRow['organization'] = {
      registered_name: name,
      trading_name: cell('trading_name'),
      parent_name: cell('parent_organisation'),
      registration_number: registration,
      website,
      organization_type: cell('organisation_type'),
      commodities: list(cell('commodities')),
      match_key: key,
      source,
      source_ref: cell('source_reference'),
      verified_on: verifiedOn,
    }

    const operationName = cell('operation_name')
    if (!operationName) {
      out.push({ organization, operation: null })
      return
    }
    const province = PROVINCE_NAMES.get(header(cell('province') ?? ''))
    if (!province) return problems.push({ line, message: `"${cell('province') ?? ''}" is not one of South Africa's nine provinces.` })
    const latitude = Number(cell('latitude'))
    const longitude = Number(cell('longitude'))
    if (!cell('latitude') || !cell('longitude') || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return problems.push({ line, message: 'An operation needs its latitude and longitude, in decimal degrees.' })
    }
    if (latitude < -35.5 || latitude > -21.5 || longitude < 15.5 || longitude > 33.5) {
      return problems.push({ line, message: 'The coordinates are outside South Africa. Latitude is negative here (for example -26.2).' })
    }
    const accuracy = (cell('location_accuracy') ?? 'exact').toLowerCase()
    if (accuracy !== 'exact' && accuracy !== 'approximate' && accuracy !== 'district') {
      return problems.push({ line, message: 'Location accuracy is exact, approximate or district.' })
    }
    const primary = cell('primary_commodity')
    out.push({
      organization: { ...organization, commodities: [...new Set([...organization.commodities, ...(primary ? [primary] : [])])] },
      operation: {
        name: operationName,
        province,
        district: cell('district'),
        latitude: Math.round(latitude * 1e6) / 1e6,
        longitude: Math.round(longitude * 1e6) / 1e6,
        primary_commodity: primary,
        other_commodities: list(cell('other_commodities')),
        operation_type: cell('operation_type'),
        operating_status: cell('operating_status'),
        location_accuracy: accuracy,
        match_key: companyKey(operationName) || operationName.toLowerCase(),
        source,
        source_ref: cell('source_reference'),
        verified_on: verifiedOn,
      },
    })
  })
  return { rows: out, problems }
}
