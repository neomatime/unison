import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const app = join(root, 'app', '(unison)')
const source = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')

test('substantive project work uses route-owned forms', () => {
  const delivery = source('features', 'delivery', 'components', 'delivery-items-panel.tsx')
  const dependencies = source('features', 'delivery', 'components', 'project-dependencies-panel.tsx')
  assert.doesNotMatch(delivery, /createPortal|DeliveryItemForm/)
  assert.match(delivery, /delivery-items\/new/)
  assert.doesNotMatch(dependencies, /createPortal|showAddDialog/)
  assert.match(dependencies, /dependencies\/new/)
  for (const route of [
    ['operations', 'projects', '[projectId]', 'delivery-items', 'new', 'page.tsx'],
    ['operations', 'projects', '[projectId]', 'delivery-items', '[itemId]', 'page.tsx'],
    ['operations', 'projects', '[projectId]', 'delivery-items', '[itemId]', 'edit', 'page.tsx'],
    ['operations', 'projects', '[projectId]', 'dependencies', 'new', 'page.tsx'],
  ]) assert.ok(existsSync(join(app, ...route)), route.join('/') + ' is missing')
})

test('shared nested records and governance actions use full pages', () => {
  const collection = source('features', 'product-ui', 'components', 'record-collection-workspace.tsx')
  const approvals = source('features', 'delivery', 'components', 'approval-workspace.tsx')
  assert.doesNotMatch(collection, /RecordPanel/)
  assert.doesNotMatch(collection, /ContextActionDialog|ImportDialog/)
  assert.match(collection, /collectionRoute/)
  assert.doesNotMatch(approvals, /ReasonDialog|PersonDialog/)
  assert.match(approvals, /\/review\?action=/)
  assert.ok(existsSync(join(app, 'records', '[collection]', 'new', 'page.tsx')))
  assert.ok(existsSync(join(app, 'records', '[collection]', 'action', 'page.tsx')))
  assert.ok(existsSync(join(app, 'records', '[collection]', 'import', 'page.tsx')))
  assert.ok(existsSync(join(app, 'records', 'action', 'page.tsx')))
  assert.ok(existsSync(join(app, 'delivery', 'approvals', '[approvalId]', 'review', 'page.tsx')))
})

test('evidence upload and Team mutations use full-page routes', () => {
  const documents = source('features', 'delivery', 'components', 'project-documents-workspace.tsx')
  const moduleRecord = source('features', 'product-ui', 'components', 'module-record.tsx')
  const teamPanel = source('features', 'team', 'components', 'team-dialogs.tsx')
  assert.doesNotMatch(documents, /UploadDialog|fixed inset-0/)
  assert.match(documents, /records\/documents\/upload/)
  assert.doesNotMatch(moduleRecord, /setUploading|setEditing|savePerson|saveItem/)
  assert.match(moduleRecord, /recordActionHref/)
  assert.match(moduleRecord, /records\/documents\/upload/)
  assert.doesNotMatch(teamPanel, /Save changes|Change Team|Change Role|Update Availability/)
  assert.ok(existsSync(join(app, 'records', 'documents', 'upload', 'page.tsx')))
  assert.ok(existsSync(join(app, 'people', 'team', '[memberId]', 'action', 'page.tsx')))
})

test('lightweight utility and activity panels remain contextual', () => {
  assert.match(source('components', 'shared', 'utility-panel.tsx'), /notifications|help|search/)
  assert.match(source('features', 'team', 'components', 'team-workspaces.tsx'), /ActivityDrawer/)
})

test('internal administrative work uses dedicated pages', () => {
  const registers = source('features', 'internal-provisioning', 'components', 'internal-registers.tsx')
  const provisioning = source('features', 'internal-provisioning', 'components', 'provisioning-wizard.tsx')
  assert.doesNotMatch(registers, /TierChangeDialog|ActionDialog/)
  assert.match(registers, /internal\/support\/new/)
  assert.match(registers, /internal\/knowledge\/new/)
  assert.match(registers, /internal\/tenants\/\$\{record\.id\}\/tier/)
  assert.doesNotMatch(provisioning, /fixed inset-0 z-\[90\].*Save User/)
  for (const route of [
    ['internal', 'support', 'new', 'page.tsx'],
    ['internal', 'knowledge', 'new', 'page.tsx'],
    ['internal', 'tenants', '[tenantId]', 'tier', 'page.tsx'],
    ['internal', 'subscriptions', '[subscriptionId]', 'tier', 'page.tsx'],
  ]) assert.ok(existsSync(join(root, 'app', '(internal)', ...route)), route.join('/') + ' is missing')
})
