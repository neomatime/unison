'use server'
import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { readAppUrl } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send-email'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { provisioningInputSchema } from '../schemas/provisioning'

const EXPIRY_DAYS = 7

export async function provisionOrganizationAction(
  _prev: { error?: string; organizationId?: string; emailFailed?: boolean } | undefined,
  formData: FormData,
) {
  const parsed = provisioningInputSchema.safeParse({
    name: formData.get('name'),
    adminEmail: formData.get('adminEmail'),
    slug: formData.get('slug') ?? undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Same token shape as send-invitation.ts: the raw value never reaches the
  // database, and token_hash is text holding '\x' || sha256 hex.
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = '\\x' + createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000).toISOString()

  const supabase = await createServerSupabase()

  // Called through the caller's own session, not the service key, so the
  // function's own authorisation check is the real gate.
  const { data: organizationId, error } = await supabase.rpc('provision_organization', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_admin_email: parsed.data.adminEmail,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  })

  if (error) {
    if (error.code === '23505') return { error: 'An organisation with that name already exists.' }
    if (error.code === '42501') return { error: 'You do not have permission to provision organisations.' }
    return { error: 'The organisation could not be created.' }
  }

  const appUrl = readAppUrl(process.env)
  const { user } = await getSessionContext()

  // The transaction has already committed. If the mail fails, the tenant exists
  // and the raw token is gone with this request — say so plainly rather than
  // reporting a success nobody can act on. reissue_invitation is the recovery.
  try {
    await sendEmail({
      to: parsed.data.adminEmail,
      template: invitationTemplate({
        organizationName: parsed.data.name,
        acceptUrl: `${appUrl}/accept-invitation?token=${rawToken}`,
        invitedBy: user.email ?? 'HIMARK',
      }),
    })
  } catch {
    revalidatePath('/internal/organisations')
    return { organizationId: organizationId as string, emailFailed: true }
  }

  revalidatePath('/internal/organisations')
  return { organizationId: organizationId as string }
}
