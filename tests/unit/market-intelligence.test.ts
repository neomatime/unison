import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { readImportRows } from '../../features/market-intelligence/import-rows.ts'
import { clusterPoints, fitView, project, provinceBounds, scaleBar } from '../../features/market-intelligence/map-geometry.ts'
import {
  companyKey,
  engagementCount,
  engagementStatus,
  filterOperations,
  filterOptions,
  snapshot,
  type LinkedRecords,
  type MarketData,
  type MarketOperation,
  type MarketOrganization,
} from '../../features/market-intelligence/model.ts'
import { MAP_HEIGHT, MAP_WIDTH, PROVINCE_SHAPES } from '../../features/market-intelligence/province-shapes.ts'

const none: LinkedRecords = { client: null, lead: null, opportunities: [], quotes: [] }
const lead = (status: string, extra: Partial<NonNullable<LinkedRecords['lead']>> = {}) => ({ id: 'l1', companyName: 'Test Co', status, archived: false, ownerName: null, convertedClientId: null, ...extra })

test('status: nothing linked is unresearched, a new lead is a prospect', () => {
  assert.equal(engagementStatus(none), 'unresearched')
  assert.equal(engagementStatus({ ...none, lead: lead('New') }), 'prospect')
  assert.equal(engagementStatus({ ...none, lead: lead('Disqualified') }), 'prospect')
})

test('status: a contacted lead or an open opportunity is active engagement', () => {
  assert.equal(engagementStatus({ ...none, lead: lead('Contacted') }), 'active')
  assert.equal(engagementStatus({ ...none, lead: lead('New'), opportunities: [{ id: 'o', name: 'x', stage: 'Discovery', archived: false }] }), 'active')
  // A lost or archived opportunity does not count.
  assert.equal(engagementStatus({ ...none, lead: lead('New'), opportunities: [{ id: 'o', name: 'x', stage: 'Lost', archived: false }] }), 'prospect')
  assert.equal(engagementStatus({ ...none, lead: lead('New'), opportunities: [{ id: 'o', name: 'x', stage: 'Qualified', archived: true }] }), 'prospect')
})

test('status: a sent quote or a proposal-stage opportunity is a proposal; a client outranks everything', () => {
  assert.equal(engagementStatus({ ...none, lead: lead('Qualified'), quotes: [{ id: 'q', status: 'Sent', archived: false }] }), 'proposal')
  assert.equal(engagementStatus({ ...none, lead: lead('Qualified'), quotes: [{ id: 'q', status: 'Draft', archived: false }] }), 'active')
  assert.equal(engagementStatus({ ...none, opportunities: [{ id: 'o', name: 'x', stage: 'Negotiation', archived: false }] }), 'proposal')
  const client = { id: 'c', name: 'Test Co', archived: false, ownerName: null, engagementType: null }
  assert.equal(engagementStatus({ ...none, client, quotes: [{ id: 'q', status: 'Sent', archived: false }] }), 'client')
  assert.equal(engagementStatus({ ...none, lead: lead('Converted', { convertedClientId: 'c' }) }), 'client')
  assert.equal(engagementStatus({ ...none, client: { ...client, archived: true } }), 'unresearched')
})

test('engagements count open and won opportunities only', () => {
  const opportunities = ['Discovery', 'Won', 'Lost', 'Proposal'].map((stage, index) => ({ id: String(index), name: stage, stage, archived: false }))
  assert.equal(engagementCount({ ...none, opportunities }), 3)
})

const organization = (id: string, status: MarketOrganization['status'], name = `Org ${id}`): MarketOrganization => ({
  id, name, tradingName: null, parentName: null, registrationNumber: null, website: null, organizationType: null, commodities: [],
  source: 'test', verifiedOn: null, status, clientId: null, clientName: null, leadId: null, leadName: null, accountOwner: null,
  engagements: 0, opportunities: [], services: null, match: null,
})
const operation = (id: string, organizationId: string, province: MarketOperation['province'], commodity: string): MarketOperation => ({
  id, organizationId, name: `Site ${id}`, province, district: null, latitude: -26, longitude: 28, primaryCommodity: commodity,
  otherCommodities: [], operationType: null, operatingStatus: null, locationAccuracy: 'exact', source: 'test', verifiedOn: null,
})

// A test fixture, not market data: invented names that exist only in this file.
const data: MarketData = {
  organizations: [organization('a', 'client'), organization('b', 'unresearched'), organization('c', 'active')],
  operations: [
    operation('1', 'a', 'Limpopo', 'Platinum Group Metals'),
    operation('2', 'a', 'North West', 'Platinum Group Metals'),
    operation('3', 'b', 'Limpopo', 'Coal'),
    operation('4', 'c', 'Mpumalanga', 'Coal'),
    operation('5', 'c', 'Mpumalanga', 'Coal'),
  ],
}

test('snapshot counts companies and engaged organisations once, however many sites they have', () => {
  const all = snapshot(data, data.operations)
  assert.deepEqual({ ...all, byStatus: undefined }, { operations: 5, companies: 3, provinces: 3, engaged: 2, byStatus: undefined })
  // The legend counts operations by status and adds up to the operation count.
  assert.deepEqual(all.byStatus, { client: 2, proposal: 0, active: 2, prospect: 0, unresearched: 1 })
  assert.equal(Object.values(all.byStatus).reduce((sum, value) => sum + value, 0), all.operations)
})

test('filters combine, and their options come from the data', () => {
  const blank = { province: '', commodity: '', company: '', status: '', search: '' }
  assert.deepEqual(filterOperations(data, { ...blank, province: 'Limpopo' }).map((item) => item.id), ['1', '3'])
  assert.deepEqual(filterOperations(data, { ...blank, province: 'Limpopo', commodity: 'Coal' }).map((item) => item.id), ['3'])
  assert.deepEqual(filterOperations(data, { ...blank, status: 'active' }).map((item) => item.id), ['4', '5'])
  assert.deepEqual(filterOperations(data, { ...blank, company: 'a' }).map((item) => item.id), ['1', '2'])
  assert.deepEqual(filterOperations(data, { ...blank, search: 'org b' }).map((item) => item.id), ['3'])
  const options = filterOptions(data)
  assert.deepEqual(options.provinces, ['Limpopo', 'Mpumalanga', 'North West'])
  assert.deepEqual(options.commodities, ['Coal', 'Platinum Group Metals'])
  assert.equal(options.companies.length, 3)
})

test('company names match without suffixes or punctuation', () => {
  assert.equal(companyKey('Example Mining (Pty) Ltd'), companyKey('EXAMPLE MINING'))
  assert.equal(companyKey('A & B Resources Limited'), 'a and b resources')
  assert.notEqual(companyKey('Example Platinum'), companyKey('Example Coal'))
})

const headers = ['organisation_name', 'registration_number', 'website', 'operation_name', 'province', 'latitude', 'longitude', 'primary_commodity', 'source', 'verified_on']

test('import: a good row is read, with an organisation key and an operation', () => {
  const { rows, problems } = readImportRows(headers, [['Example Mining (Pty) Ltd', '', 'example.test', 'North Shaft', 'limpopo', '-24.1', '29.5', 'Coal', 'Test register', '2026-11-01']])
  assert.deepEqual(problems, [])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].organization.match_key, 'example mining')
  assert.equal(rows[0].organization.website, 'https://example.test')
  assert.deepEqual(rows[0].organization.commodities, ['Coal'])
  assert.equal(rows[0].operation?.province, 'Limpopo')
  assert.equal(rows[0].operation?.latitude, -24.1)
})

test('import: the registration number is the key when there is one', () => {
  const { rows } = readImportRows(headers, [['Example Mining', '2001/012345/07', '', '', '', '', '', '', 'Test', '']])
  assert.equal(rows[0].organization.match_key, 'reg:2001/012345/07')
  assert.equal(rows[0].operation, null)
})

test('import: bad rows are refused with the reason and their line number, never filled in', () => {
  const { rows, problems } = readImportRows(headers, [
    ['', '', '', '', '', '', '', '', 'Test', ''],
    ['A', '', '', '', '', '', '', '', '', ''],
    ['B', '', '', 'Site', 'Gauteng', '26.2', '28.0', '', 'Test', ''],
    ['C', '', '', 'Site', 'Atlantis', '-26.2', '28.0', '', 'Test', ''],
    ['D', '', '', 'Site', 'Gauteng', '', '', '', 'Test', ''],
    ['E', '', '', '', '', '', '', '', 'Test', '1/11/2026'],
  ])
  assert.equal(rows.length, 0)
  assert.deepEqual(problems.map((problem) => problem.line), [2, 3, 4, 5, 6, 7])
  assert.match(problems[2].message, /outside South Africa/)
  assert.match(problems[3].message, /nine provinces/)
})

test('import: a file without the required columns is refused as a whole', () => {
  const { rows, problems } = readImportRows(['name'], [['x']])
  assert.equal(rows.length, 0)
  assert.match(problems[0].message, /organisation_name/)
})

test('the map has all nine provinces with real outlines, and projects coordinates inside them', () => {
  assert.equal(PROVINCE_SHAPES.length, 9)
  for (const shape of PROVINCE_SHAPES) assert.ok(shape.d.length > 1000, `${shape.name} has an outline`)
  // Johannesburg is inside Gauteng's box; Cape Town inside the Western Cape's.
  const johannesburg = project(28.05, -26.2)
  const gauteng = provinceBounds('Gauteng')!
  assert.ok(johannesburg.x > gauteng.minX && johannesburg.x < gauteng.maxX && johannesburg.y > gauteng.minY && johannesburg.y < gauteng.maxY)
  const capeTown = project(18.42, -33.92)
  const western = provinceBounds('Western Cape')!
  assert.ok(capeTown.x > western.minX && capeTown.x < western.maxX && capeTown.y > western.minY && capeTown.y < western.maxY)
  assert.ok(MAP_WIDTH > 1000 && MAP_HEIGHT > 1000)
})

test('map: fitting, clustering and the scale bar', () => {
  const view = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { width: 248, height: 248 }, 24)
  assert.equal(view.k, 2)
  const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 90, y: 40 }]
  assert.equal(clusterPoints(points, { k: 1, x: 0, y: 0 }, 30).length, 2)
  assert.equal(clusterPoints(points, { k: 100, x: 0, y: 0 }, 30).length, 3)
  const bar = scaleBar(1)
  assert.ok(bar.pixels > 50 && bar.pixels < 200)
})

test('the overview places the market panel between the KPI cards and the pipeline, and keeps the rest', () => {
  const screen = readFileSync('features/crm-overview/components/crm-overview-screen.tsx', 'utf8')
  const kpis = screen.indexOf('<KpiCards')
  const market = screen.indexOf('<MarketPanel')
  const pipeline = screen.indexOf('<SalesPipeline')
  assert.ok(kpis > 0 && market > kpis && pipeline > market)
  assert.match(screen, /<RevenuePanel/)
})

test('market data is only written by the import function, and members may only change the CRM links', () => {
  const migration = readFileSync('supabase/migrations/20261114110000_market_intelligence.sql', 'utf8')
  assert.match(migration, /grant update \(client_id, lead_id\) on public\.market_organizations to authenticated/)
  assert.match(migration, /has_role\(p_organization_id, array\['owner', 'admin'\]\)/)
  assert.doesNotMatch(migration, /grant (insert|delete)[^;]*market_/)
})
