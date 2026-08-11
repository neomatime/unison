import assert from 'node:assert/strict'
import test from 'node:test'
import { MissingEnvError, readAppUrl, readSmtpEnv, readSupabaseEnv } from '../../lib/env.ts'

const supabaseVars = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'secret',
}

const smtpVars = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'invitations@himark.example',
  SMTP_PASSWORD: 'password',
  SMTP_FROM: 'HIMARK <invitations@himark.example>',
}

test('readSupabaseEnv returns typed values when present', () => {
  const env = readSupabaseEnv(supabaseVars)
  assert.equal(env.SUPABASE_URL, 'https://example.supabase.co')
  assert.equal(env.SUPABASE_SECRET_KEY, 'secret')
})

test('readSupabaseEnv names the missing variable', () => {
  const { SUPABASE_SECRET_KEY: _omitted, ...incomplete } = supabaseVars
  assert.throws(() => readSupabaseEnv(incomplete), (error: unknown) => {
    assert.ok(error instanceof MissingEnvError)
    assert.match((error as Error).message, /SUPABASE_SECRET_KEY/)
    return true
  })
})

test('readSupabaseEnv does not require SMTP variables', () => {
  assert.doesNotThrow(() => readSupabaseEnv(supabaseVars))
})

test('readSmtpEnv coerces the port to a number', () => {
  assert.equal(readSmtpEnv(smtpVars).SMTP_PORT, 465)
})

test('readSmtpEnv rejects a non-numeric port', () => {
  assert.throws(() => readSmtpEnv({ ...smtpVars, SMTP_PORT: 'abc' }), MissingEnvError)
})

test('readAppUrl reads the public app url', () => {
  assert.equal(readAppUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }), 'http://localhost:3000')
})
