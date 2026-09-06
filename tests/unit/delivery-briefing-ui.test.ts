import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const workspace = process.cwd()
const overviewPage = readFileSync(join(workspace, 'app', '(unison)', 'overview', 'page.tsx'), 'utf8')
const overviewScreen = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-overview-screen.tsx'), 'utf8')
const overviewComponents = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-overview-components.tsx'), 'utf8')
const briefingHeader = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-briefing-header.tsx'), 'utf8')
const deliveryPrimitives = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-primitives.tsx'), 'utf8')
const designTokens = readFileSync(join(workspace, 'styles', 'tokens.css'), 'utf8')

test('the live tenant overview stays connected to the real delivery query', () => {
  assert.match(
    overviewPage,
    /import \{ DeliveryOverviewScreen \} from ['"]@\/features\/delivery\/components\/delivery-overview-screen['"]/,
  )
  assert.match(
    overviewPage,
    /import \{ getDeliveryOverview \} from ['"]@\/features\/delivery\/queries\/delivery-overview['"]/,
  )
  assert.match(overviewPage, /const overview = await getDeliveryOverview\(\)/)
  assert.match(overviewPage, /<DeliveryOverviewScreen overview=\{overview\} \/>/)

  const importSources = [...overviewPage.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
  assert.equal(importSources.some((source) => source.includes('features/overview')), false, 'the retired fixture-backed Overview must not be reconnected')
  assert.equal(importSources.some((source) => /(?:^|\/)(?:mocks|fixtures?)(?:\/|$)|(?:^|\/)data$/.test(source)), false, 'the live Overview must not import fixture data')
})

test('the overview screen composes exactly the briefing header and three primary zones', () => {
  const renderedComponents = [...overviewScreen.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1])

  assert.deepEqual(renderedComponents, [
    'DeliveryBriefingHeader',
    'OverallPositionBrief',
    'InterventionList',
    'DeliveryHorizon',
  ])
})

test('the briefing source carries the approved hierarchy without legacy dashboard widgets', () => {
  for (const heading of ['Overall position', 'Requires intervention', 'Delivery horizon']) {
    assert.match(overviewComponents, new RegExp(heading), `${heading} is missing from the live briefing`)
  }

  for (const retired of ['PortfolioHealthRing', 'ExecutiveMetricCard', 'Recent Activity', 'My Tasks']) {
    assert.doesNotMatch(overviewComponents, new RegExp(retired), `${retired} must not appear in the live briefing`)
  }
})

test('the briefing header uses shell context and the intervention queue is a semantic table', () => {
  assert.match(briefingHeader, /useShellContext\(\)/)
  assert.match(briefingHeader, /import \{ TenantSwitcher \}/)
  assert.match(briefingHeader, /<TenantSwitcher \/>/)
  assert.doesNotMatch(briefingHeader, /\bNeo\b|14 Apr 2025/i)

  const tableStart = overviewComponents.indexOf('<table')
  const tableEnd = overviewComponents.indexOf('</table>', tableStart)
  assert.ok(tableStart >= 0 && tableEnd > tableStart, 'the intervention queue must render a real table')

  const tableSource = overviewComponents.slice(tableStart, tableEnd + '</table>'.length)
  assert.match(tableSource, /<caption\b/)
  assert.match(tableSource, /<th\b[^>]*\bscope=['"]col['"]/)
})

test('the briefing preserves count reconciliation, compact previews and safe breakpoints', () => {
  assert.match(overviewComponents, /overview\.healthCounts\.Watch > 0/)
  assert.match(overviewComponents, /visibleRows = rows\.slice\(0, 3\)/)
  assert.match(overviewComponents, /min-\[1360px\]:hidden/)
  assert.match(overviewComponents, /hidden min-\[1360px\]:block/)
  assert.match(overviewComponents, /min-\[1360px\]:grid-cols-3/)
  assert.match(overviewComponents, />\s*Create project\s*</)
  assert.doesNotMatch(overviewComponents, /Create the first project/)

  const metricStart = overviewComponents.indexOf('{metrics.map')
  const metricEnd = overviewComponents.indexOf('</dl>', metricStart)
  const metricSource = overviewComponents.slice(metricStart, metricEnd)
  assert.ok(metricSource.indexOf('<dt') < metricSource.indexOf('<dd'), 'metric terms must precede their descriptions in the DOM')
})

test('briefing status labels, secondary copy and phase colors stay accessible and aligned', () => {
  assert.match(designTokens, /--briefing-muted:\s*#53677c/)
  assert.match(overviewComponents, /text-\[var\(--briefing-muted\)\]/)
  assert.match(briefingHeader, /text-\[var\(--briefing-muted\)\]/)
  assert.match(deliveryPrimitives, /'At Risk':\s*'bg-amber-[^']+ text-amber-[^']+'/)
  assert.match(deliveryPrimitives, /Critical:\s*'bg-red-[^']+ text-white'/)

  assert.match(overviewComponents, /const coloredColumns = itemColumns\.map/)
  assert.match(overviewComponents, /backgroundColor: column\.color/)
  assert.doesNotMatch(overviewComponents, /columns\.filter\([^)]*\)\.map\(\(column, index\)/)
})
