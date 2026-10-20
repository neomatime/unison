import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Shared fixtures for the quote portal's database tests (slice 2), drawn from the helpers quote-portal-read.test.ts
// defines inline. Every quote goes out through the real send_quote and every link through the real
// create_quote_access_link, made by a signed-in member; the service role only moves what a member cannot (dates,
// archiving, pointers, a frozen line). Not a test file: the suite's glob is *.test.ts.
//
// setupPortalOrg() makes one organisation with the portal switched on, one client and three team profiles:
//   - sender: a signed-in member with a team profile (linked to the login by its email), the default author of quotes
//     and links, and so the member who sent a link when the owner did not;
//   - owner: a second signed-in member with a team profile, to own quotes (quote owner with a login);
//   - ownerWithoutLogin: a team profile whose email matches no sign-in (quote owner without a login).
// teardown() removes the organisation, everything under it and the two users through helpers.cleanup().

export type PortalMember = { userId: string; email: string; client: SupabaseClient; teamMemberId: string }
export type Line = { title: string; position?: number; charge_kind?: 'once_off' | 'monthly' | null; description?: string }
export type PortalLink = { id: string; token: string }

export type PortalOrg = {
  orgId: string
  clientId: string
  sender: PortalMember
  owner: PortalMember
  ownerWithoutLogin: { teamMemberId: string; email: string }
  /** A draft made by a signed-in member (the sender unless `by` says otherwise), with its lines. */
  draftQuote: (fields?: Record<string, unknown>, lines?: Line[], by?: PortalMember) => Promise<string>
  /** A quote sent through the real send_quote. */
  sentQuote: (fields?: Record<string, unknown>, lines?: Line[], by?: PortalMember) => Promise<string>
  /** A link made through the real create_quote_access_link; created_by is the member who made it. */
  newLink: (quoteId: string, options?: { email?: string; name?: string | null; by?: PortalMember }) => Promise<PortalLink>
  /** A revision through the real revise_quote (a draft; sending it supersedes the original). */
  revise: (quoteId: string, by?: PortalMember) => Promise<string>
  /** A status set by hand by a signed-in member, as staff would. */
  setStatus: (quoteId: string, status: string, by?: PortalMember) => Promise<void>
  teardown: () => Promise<void>
}

const DEFAULT_TERMS = 'Portal terms: payment within 30 days of acceptance.'

export const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export const quoteRow = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Record<string, any>
export const linkRow = async (id: string) => must(await admin.from('quote_access_links').select('*').eq('id', id).single()) as Record<string, any>
export const lineRows = async (quoteId: string) =>
  must(await admin.from('quote_lines').select('*').eq('quote_id', quoteId).order('position')) as Array<Record<string, any>>
export const setQuote = async (id: string, change: Record<string, unknown>) => assert.equal((await admin.from('quotes').update(change).eq('id', id)).error, null)
export const setLink = async (id: string, change: Record<string, unknown>) =>
  assert.equal((await admin.from('quote_access_links').update(change).eq('id', id)).error, null)

/** A signed-in member of the organisation with a team profile linked to the login (by the trigger, through the email). */
const memberWithProfile = async (orgId: string, fullName: string, jobTitle: string, userIds: string[]): Promise<PortalMember> => {
  const user = await createFixtureUser(orgId, 'member')
  userIds.push(user.id)
  const client = await signedInClient(user.email, user.password)
  const profile = must(await admin.from('team_members').insert({ organization_id: orgId, full_name: fullName, email: user.email, job_title: jobTitle })
    .select('id,user_id').single())
  assert.equal(profile.user_id, user.id, `${fullName}'s profile is linked to the login`)
  return { userId: user.id, email: user.email, client, teamMemberId: profile.id as string }
}

export async function setupPortalOrg(label: string): Promise<PortalOrg> {
  const orgId = await createFixtureOrg(label)
  const userIds: string[] = []
  const teardown = () => cleanup([orgId], userIds)
  try {
    must(await admin.from('organization_settings').insert({
      organization_id: orgId, legal_name: 'Portal Fixture (Pty) Ltd', document_prefix: 'PFX', vat_rate: 15, quote_portal_enabled: true,
      default_quote_terms: DEFAULT_TERMS, email: 'hello@portal-fixture.test',
    }).select('id').single())
    const clientId = must(await admin.from('clients').insert({ organization_id: orgId, name: 'Portal Client', status: 'Active' }).select('id').single()).id as string
    const sender = await memberWithProfile(orgId, 'Sam Sender', 'Account Manager', userIds)
    const owner = await memberWithProfile(orgId, 'Olive Owner', 'Client Director', userIds)
    const noLoginEmail = `no-login-${randomUUID().slice(0, 8)}@portal-fixture.test`
    const noLogin = must(await admin.from('team_members').insert({
      organization_id: orgId, full_name: 'Nora Nologin', email: noLoginEmail, job_title: 'Consultant',
    }).select('id,user_id').single())
    assert.equal(noLogin.user_id, null, 'the profile without a login has no user')

    const draftQuote = async (fields: Record<string, unknown> = {}, lines: Line[] = [{ title: 'Advisory' }], by: PortalMember = sender) => {
      const quote = must(await by.client.from('quotes').insert({ organization_id: orgId, client_id: clientId, client_name: 'Portal Client', ...fields }).select('id').single())
      for (const [index, line] of lines.entries()) {
        const written = await by.client.from('quote_lines').insert({
          organization_id: orgId, quote_id: quote.id, position: line.position ?? index + 1, title: line.title, description: line.description ?? null,
          quantity: 1, unit_price: 100, charge_kind: line.charge_kind ?? null,
        })
        assert.equal(written.error, null)
      }
      return quote.id as string
    }
    const sentQuote = async (fields: Record<string, unknown> = {}, lines?: Line[], by: PortalMember = sender) => {
      const id = await draftQuote(fields, lines, by)
      assert.equal((await by.client.rpc('send_quote', { p_id: id })).error, null)
      return id
    }
    const newLink = async (quoteId: string, { email = 'client@example.test', name = null, by = sender }: { email?: string; name?: string | null; by?: PortalMember } = {}) => {
      const token = must(await by.client.rpc('create_quote_access_link', { p_quote_id: quoteId, p_recipient_email: email, p_recipient_name: name })) as string
      const row = must(await admin.from('quote_access_links').select('id').eq('token_hash', sha256(token)).single())
      return { id: row.id as string, token }
    }
    const revise = async (quoteId: string, by: PortalMember = sender) => must(await by.client.rpc('revise_quote', { p_id: quoteId })) as string
    const setStatus = async (quoteId: string, status: string, by: PortalMember = sender) =>
      assert.equal((await by.client.from('quotes').update({ status }).eq('id', quoteId)).error, null)

    return {
      orgId, clientId, sender, owner, ownerWithoutLogin: { teamMemberId: noLogin.id as string, email: noLoginEmail },
      draftQuote, sentQuote, newLink, revise, setStatus, teardown,
    }
  } catch (error) {
    // The caller never receives a teardown when setup fails part way, so what was made is removed here.
    await teardown().catch(() => {})
    throw error
  }
}
