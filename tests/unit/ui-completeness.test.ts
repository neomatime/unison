import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const workspace = process.cwd()
const unisonRoot = join(workspace, 'app', '(unison)')

const moduleRoutes = [
  ['clients', 'operations/clients'],
  ['projects', 'operations/projects'],
  ['tasks', 'operations/tasks'],
  ['calendar', 'operations/calendar'],
  ['leads', 'commercial/leads'],
  ['quotes', 'commercial/quotes'],
  ['sales', 'commercial/sales'],
  ['invoices', 'finance/invoices'],
  ['expenses', 'finance/expenses'],
  ['forecast', 'finance/forecast'],
  ['team', 'people/team'],
  ['hr', 'people/hr'],
  ['leave', 'people/leave'],
  ['knowledge', 'knowledge'],
  ['atlas', 'atlas'],
  ['settings', 'settings'],
] as const

test('every visible module has workspace, create, detail, and edit screens', () => {
  for (const [moduleId, route] of moduleRoutes) {
    const routeRoot = join(unisonRoot, ...route.split('/'))
    assert.ok(existsSync(join(routeRoot, 'page.tsx')), `${moduleId} workspace route is missing`)
    assert.ok(existsSync(join(routeRoot, 'new', 'page.tsx')), `${moduleId} create route is missing`)

    const routeFiles = readFileSync(join(routeRoot, 'page.tsx'), 'utf8')
    assert.match(routeFiles, new RegExp(`moduleById\\.${moduleId}`), `${moduleId} route is not connected to its module`)

    const dynamicFolders = ['clientId','projectId','taskId','eventId','leadId','quoteId','opportunityId','invoiceId','expenseId','scenarioId','employeeId','recordId','requestId','articleId','insightId','settingId']
    const dynamicFolder = dynamicFolders.map((name) => join(routeRoot, `[${name}]`)).find(existsSync)
    assert.ok(dynamicFolder, `${moduleId} detail directory is missing`)
    assert.ok(existsSync(join(dynamicFolder!, 'page.tsx')), `${moduleId} detail route is missing`)
    assert.ok(existsSync(join(dynamicFolder!, 'edit', 'page.tsx')), `${moduleId} edit route is missing`)
  }
})

test('all declared modules are enabled and represented in the UI registry', () => {
  const moduleConfig = readFileSync(join(workspace, 'config', 'modules.ts'), 'utf8')
  const registry = readFileSync(join(workspace, 'features', 'product-ui', 'registry.ts'), 'utf8')
  for (const [moduleId] of moduleRoutes.filter(([id]) => id !== 'settings')) {
    assert.match(moduleConfig, new RegExp(`id: '${moduleId}'.*enabled: true`), `${moduleId} is disabled in module config`)
    assert.match(registry, new RegExp(`id: '${moduleId}'`), `${moduleId} is absent from the product registry`)
  }
  assert.match(registry, /id: 'settings'/)
})

test('global fallback and loading screens exist', () => {
  for (const file of [
    join(workspace, 'app', 'error.tsx'),
    join(workspace, 'app', 'not-found.tsx'),
    join(unisonRoot, 'loading.tsx'),
    join(workspace, 'app', '(auth)', 'loading.tsx'),
    join(workspace, 'app', '(onboarding)', 'loading.tsx'),
    join(workspace, 'components', 'shared', 'navigation-loading.tsx'),
  ]) assert.ok(existsSync(file), `${file} is missing`)
})
