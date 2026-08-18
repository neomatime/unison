import assert from 'node:assert/strict'
import test from 'node:test'
import { MissingEnvError, readAppUrl, readGraphEnv, readSupabasePublicEnv, readSupabaseSecretKey } from '../../lib/env.ts'

const supabasePublicVars = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
}

const supabaseVars = {
  ...supabasePublicVars,
  SUPABASE_SECRET_KEY: 'secret',
}

const graphVars = {
  GRAPH_TENANT_ID: 'tenant-id',
  GRAPH_CLIENT_ID: 'client-id',
  GRAPH_CLIENT_SECRET: 'client-secret',
  MAIL_FROM: 'HIMARK <invitations@himark.example>',
}

test('readSupabasePublicEnv returns typed values when present', () => {
  const env = readSupabasePublicEnv(supabaseVars)
  assert.equal(env.SUPABASE_URL, 'https://example.supabase.co')
  assert.equal(env.SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_test')
})

test('readSupabasePublicEnv names the missing variable', () => {
  const { NEXT_PUBLIC_SUPABASE_URL: _omitted, ...incomplete } = supabasePublicVars
  assert.throws(() => readSupabasePublicEnv(incomplete), (error: unknown) => {
    assert.ok(error instanceof MissingEnvError)
    assert.match((error as Error).message, /NEXT_PUBLIC_SUPABASE_URL/)
    return true
  })
})

test('readSupabasePublicEnv does not require SUPABASE_SECRET_KEY', () => {
  // The whole point of splitting the reader: a deployment holding only the
  // public keys (the correct posture for a user-scoped client) must be able
  // to construct that client without the service-role secret being present.
  assert.doesNotThrow(() => readSupabasePublicEnv(supabasePublicVars))
})

test('readSupabaseSecretKey returns the secret when present', () => {
  assert.equal(readSupabaseSecretKey(supabaseVars), 'secret')
})

test('readSupabaseSecretKey names the missing variable', () => {
  assert.throws(() => readSupabaseSecretKey(supabasePublicVars), (error: unknown) => {
    assert.ok(error instanceof MissingEnvError)
    assert.match((error as Error).message, /SUPABASE_SECRET_KEY/)
    return true
  })
})

test('readGraphEnv returns the Graph credentials when present', () => {
  const env = readGraphEnv(graphVars)
  assert.equal(env.GRAPH_TENANT_ID, 'tenant-id')
  assert.equal(env.MAIL_FROM, 'HIMARK <invitations@himark.example>')
})

test('readGraphEnv names the missing variable', () => {
  const { GRAPH_CLIENT_SECRET: _omitted, ...incomplete } = graphVars
  assert.throws(() => readGraphEnv(incomplete), (error: unknown) => {
    assert.ok(error instanceof MissingEnvError)
    assert.match((error as Error).message, /GRAPH_CLIENT_SECRET/)
    return true
  })
})

test('readGraphEnv is independent of the Supabase readers', () => {
  // Same reasoning as the split above: mail configuration must never be a
  // precondition for reaching the database, and vice versa.
  assert.doesNotThrow(() => readGraphEnv(graphVars))
  assert.doesNotThrow(() => readSupabasePublicEnv(supabasePublicVars))
})

test('readAppUrl reads the public app url', () => {
  assert.equal(readAppUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }), 'http://localhost:3000')
})
