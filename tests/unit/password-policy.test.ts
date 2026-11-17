import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { canSendResetLink, mayChoosePassword } from '../../features/auth-ui/password-policy.ts'

const now = new Date('2026-11-17T12:00:00Z')

test('only a session started from a fresh reset link may set a password', () => {
  assert.equal(mayChoosePassword({ recovery_sent_at: '2026-11-17T11:40:00Z', last_sign_in_at: '2026-11-17T11:45:00Z' }, now), true)
  // Signed in as usual, never sent a link.
  assert.equal(mayChoosePassword({ recovery_sent_at: null, last_sign_in_at: '2026-11-17T11:00:00Z' }, now), false)
  // A link was sent but this session is older than it: the person has not clicked it.
  assert.equal(mayChoosePassword({ recovery_sent_at: '2026-11-17T11:50:00Z', last_sign_in_at: '2026-11-17T09:00:00Z' }, now), false)
  // An old link.
  assert.equal(mayChoosePassword({ recovery_sent_at: '2026-11-17T09:00:00Z', last_sign_in_at: '2026-11-17T09:05:00Z' }, now), false)
  assert.equal(mayChoosePassword(null, now), false)
  assert.equal(mayChoosePassword({ recovery_sent_at: 'nonsense', last_sign_in_at: 'nonsense' }, now), false)
})

test('who may send whom a reset link', () => {
  assert.equal(canSendResetLink('owner', 'owner'), true)
  assert.equal(canSendResetLink('owner', 'member'), true)
  assert.equal(canSendResetLink('admin', 'member'), true)
  assert.equal(canSendResetLink('admin', 'admin'), true)
  assert.equal(canSendResetLink('admin', 'owner'), false)
  assert.equal(canSendResetLink('member', 'member'), false)
  assert.equal(canSendResetLink('', 'member'), false)
})

test('there is no self-service password reset: no Forgot link, no request action, and the reset page needs an admin-sent link', () => {
  const screen = readFileSync('features/auth-ui/auth-screen.tsx', 'utf8')
  assert.doesNotMatch(screen, />Forgot password\?</)
  const actions = readFileSync('features/auth-ui/actions/account-access.ts', 'utf8')
  const request = actions.slice(actions.indexOf('export async function requestPasswordResetAction'), actions.indexOf('export async function updatePasswordAction'))
  assert.doesNotMatch(request, /resetPasswordForEmail/, 'a visitor must not be able to trigger a reset email')
  assert.match(actions.slice(actions.indexOf('export async function updatePasswordAction')), /mayChoosePassword/)
  assert.match(readFileSync('app/(auth)/reset-password/page.tsx', 'utf8'), /mayChoosePassword/)
})

test('the administrator action checks the role, the target and the workspace, and sends the link from the server', () => {
  const action = readFileSync('features/memberships/actions/send-reset-link.ts', 'utf8')
  assert.match(action, /canSendResetLink/)
  assert.match(action, /listOrganizationMembers/)
  assert.match(action, /resetPasswordForEmail/)
  assert.match(action, /status !== 'active'/)
  const page = readFileSync('app/(unison)/settings/(tabs)/access/page.tsx', 'utf8')
  assert.match(page, /AccessWorkspace/)
  assert.match(readFileSync('features/platform-automation/components/automation-nav.tsx', 'utf8'), /\/settings\/access/)
})
