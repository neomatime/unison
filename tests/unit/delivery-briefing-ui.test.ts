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

test('the briefing title matches the overall-position headline typography', () => {
  const typography = 'text-[1.625rem] leading-tight font-bold tracking-[-0.035em] text-foreground sm:text-[1.875rem]'

  assert.match(briefingHeader, new RegExp(typography.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(overviewComponents, new RegExp(typography.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(briefingHeader, /<h1 className="[^"]*unison-page-title/)
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

test('the phase panel cannot render a project-derived number under an item heading', () => {
  // The panel is labelled as charting delivery items. It used to chart
  // projects, and the failure mode this guards is the quiet one: a chart that
  // changes its unit while keeping its heading is worse than an empty one.
  const start = overviewComponents.indexOf('function PhaseDistribution')
  assert.ok(start >= 0, 'PhaseDistribution was not found')
  const next = overviewComponents.indexOf('\nfunction ', start + 1)
  const panel = overviewComponents.slice(start, next === -1 ? undefined : next)

  // activeProjects is still legitimately used to tell "no projects" from "no
  // items", so the assertion is about what is COUNTED, not what is referenced.
  for (const projectField of ['lifecycleProjectCount', 'frameworkProjectCount', 'active projects use']) {
    assert.ok(!panel.includes(projectField), `the item panel must not report '${projectField}'`)
  }

  assert.match(panel, /itemColumns/, 'the panel must chart the item-derived columns')
  assert.match(panel, /itemCount/, 'the panel must report the item count')

  // The chart's aria-label is the least visible place this can go wrong: a
  // sighted reader sees the heading and the counts, a screen-reader user gets
  // only this string. It said "projects" before this slice.
  const label = panel.slice(panel.indexOf('aria-label'), panel.indexOf('\n', panel.indexOf('aria-label')))
  assert.ok(!/\bprojects\b/.test(label), `the chart's accessible label must not say projects: ${label}`)
  assert.match(label, /item/, "the chart's accessible label must name delivery items")

  // The assertions above prove PhaseDistribution's own body only ever names
  // items. They do not prove the call site actually feeds it item-derived
  // values -- rewriting the DeliveryHorizon call site to pass
  // itemCount={overview.activeProjects} or project-derived columns under the
  // same prop names would leave every assertion above green. This closes
  // that seam by checking the wire between the query and the component, not
  // just the component it feeds.
  const horizonStart = overviewComponents.indexOf('function DeliveryHorizon')
  assert.ok(horizonStart >= 0, 'DeliveryHorizon was not found')
  const horizonNext = overviewComponents.indexOf('\nfunction ', horizonStart + 1)
  const horizon = overviewComponents.slice(horizonStart, horizonNext === -1 ? undefined : horizonNext)
  assert.match(horizon, /itemColumns=\{overview\.itemPhaseColumns\}/, 'DeliveryHorizon must pass the item-derived phase columns to the panel')
  assert.match(horizon, /itemCount=\{overview\.leadingFrameworkItemCount\}/, "DeliveryHorizon must pass the leading framework's item count to the panel")
})

test('the briefing reports blocked delivery items, and can tell none from absent', () => {
  const start = overviewComponents.indexOf('function KeyFocusList')
  const next = overviewComponents.indexOf('\nfunction ', start + 1)
  const panel = overviewComponents.slice(start, next === -1 ? undefined : next)

  assert.match(panel, /blockedItemCount/, 'the focus list must read the blocked count')
  assert.match(panel, /blockedItemProjectCount/, 'the focus list must name the projects those items span')
  // Without this, "no items are blocked" gets claimed for a tenant that has
  // recorded no items at all — the honest-zero rule.
  assert.match(panel, /activeItemCount/, 'the focus list must tell "none blocked" from "none recorded"')
})

test('the briefing never denies that risks and dependencies are persisted', () => {
  // This panel used to read "Risks, dependencies and downstream impacts are not
  // persisted in the current delivery model." That was true when written and
  // became false the moment project_risks and project_dependencies shipped,
  // leaving the flagship screen understating the product to its own users.
  //
  // This guards the inverse of the usual defect. The codebase rule is that a
  // field in the UI is a claim the product supports a capability; the mirror of
  // it is that an empty state must not deny one the product has.
  // Block comments are stripped first: the panel carries a comment recording
  // this exact history, and a guard that cannot tell narration from rendered
  // copy would force the explanation to be deleted to stay green.
  const rendered = overviewComponents.split('/*').map((part, index) => (index === 0 ? part : part.slice(part.indexOf('*/') + 2))).join('')

  for (const denial of [
    'No structured register is connected',
    'not persisted in the current delivery model',
  ]) {
    assert.ok(
      !rendered.includes(denial),
      `the briefing must not tell the user the product cannot hold this: "${denial}"`,
    )
  }
})

test('the risks panel reads the real register rather than rendering a fixed state', () => {
  const start = overviewComponents.indexOf('function TopRisksDependencies')
  assert.ok(start >= 0, 'TopRisksDependencies was not found')
  const next = overviewComponents.indexOf('\nfunction ', start + 1)
  const panel = overviewComponents.slice(start, next === -1 ? undefined : next)

  for (const field of ['topRisks', 'openRiskCount', 'dependencyCount']) {
    assert.ok(panel.includes(field), `the panel must read overview.${field}`)
  }

  // The panel taking no props at all is exactly how it came to be a hardcoded
  // claim in the first place.
  assert.match(panel, /TopRisksDependencies\(\{\s*overview\s*\}/, 'the panel must take the overview')
  assert.match(
    overviewComponents,
    /<TopRisksDependencies overview=\{overview\}/,
    'the call site must pass the overview through',
  )
})

test('an empty risk register reports absent data, not an absent capability', () => {
  const start = overviewComponents.indexOf('function TopRisksDependencies')
  const next = overviewComponents.indexOf('\nfunction ', start + 1)
  const panel = overviewComponents.slice(start, next === -1 ? undefined : next)

  // "No open risks recorded" is a statement about this tenant. Anything phrased
  // as the product lacking a register is the defect this whole panel had.
  assert.match(panel, /No open risks recorded/, 'the empty state must describe the data, not the model')
  assert.match(panel, /No project-to-project dependencies recorded/, 'the dependency line needs an honest zero too')
})
