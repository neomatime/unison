import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the Team page lists only people with a Microsoft sign-in, and has no manual add', () => {
  const register = readFileSync('features/operations/components/phase-four-register.tsx', 'utf8')
  const screen = register.slice(register.indexOf('export async function PersistentTeamScreen'), register.indexOf('export async function PhaseFourRegister'))
  assert.match(screen, /listMicrosoftTeamMembers/)
  assert.doesNotMatch(screen, /New Team Member/)
  assert.doesNotMatch(screen, /allowImport/)
  assert.match(readFileSync('app/(unison)/people/team/new/page.tsx', 'utf8'), /redirect\('\/people\/team'\)/)
  const query = readFileSync('features/operations/queries/phase-four.ts', 'utf8')
  assert.match(query, /team_microsoft_user_ids/)
})

test('the database exposes Microsoft members and creates a profile on first Microsoft sign-in', () => {
  const sql = readFileSync('supabase/migrations/20261117100000_team_microsoft_accounts.sql', 'utf8')
  assert.match(sql, /provider = 'azure'/)
  assert.match(sql, /auth\.uid\(\)/, 'only members of the organisation may ask')
  assert.match(sql, /create trigger memberships_create_team_profile/)
  assert.doesNotMatch(sql, /delete from/i, 'nothing is deleted')
})
