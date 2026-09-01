import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}

/**
 * Request paths permitted to hold the service role, and why.
 *
 * This list replaced a rule that keyed on the `features/` directory. That rule
 * did not mean what its name suggested: `lib/` already held a service-role
 * caller on a request path — create-invited-account.ts, which runs on the
 * signed-out accept-invitation request — so moving a call one directory
 * sideways would have satisfied the test while changing nothing.
 *
 * Adding an entry here is a deliberate act. Each one needs a reason that says
 * why RLS cannot express the authorisation instead.
 */
export const SERVICE_ROLE_REQUEST_PATHS = [
  // Creates the auth identity for an invited address. Runs signed out, so there
  // is no session for RLS to scope to; the invitation token is the credential.
  'lib/invitations/create-invited-account.ts',
  // Provisioning creates an organisation the operator is not a member of, so
  // there is no membership for a policy to check. Authorisation moved into
  // provision_organization, which checks has_role_for against a named actor.
  'features/internal-provisioning/actions/provision-organization.ts',
]

test('only allowlisted request paths import the service-role client', () => {
  const roots = ['features', 'lib', 'app', 'components']
  const offenders = roots
    .flatMap((root) => walk(join(process.cwd(), root)))
    .filter((file) => /from ['"](@\/lib\/supabase\/admin|.*\/lib\/supabase\/admin)['"]/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(process.cwd(), file).split(sep).join('/'))
    .filter((file) => !SERVICE_ROLE_REQUEST_PATHS.includes(file))
  assert.deepEqual(offenders, [], `service-role client imported outside the allowlist by: ${offenders.join(', ')}`)
})

test('the allowlist names files that exist', () => {
  // An allowlist entry for a deleted or renamed file silently widens nothing,
  // but it does rot: the next reader trusts a reason that no longer applies.
  for (const file of SERVICE_ROLE_REQUEST_PATHS) {
    assert.ok(existsSync(join(process.cwd(), file)), `${file} is allowlisted but does not exist`)
  }
})

test('the allowlist is exactly the two known request-path callers', () => {
  // Pinned by value so widening it is a visible diff in this file rather than a
  // silent pass. A third service-role request path may well be legitimate; it
  // must be argued for here, next to the reasons the other two carry.
  assert.deepEqual([...SERVICE_ROLE_REQUEST_PATHS].sort(), [
    'features/internal-provisioning/actions/provision-organization.ts',
    'lib/invitations/create-invited-account.ts',
  ])
})

test('the admin client is marked server-only', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'supabase', 'admin.ts'), 'utf8')
  assert.match(source, /import 'server-only'/)
})
