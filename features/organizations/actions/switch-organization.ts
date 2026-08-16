'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/session-context'

export async function switchOrganizationAction(formData: FormData) {
  const target = String(formData.get('organizationId') ?? '')
  const { organizations } = await getSessionContext()

  // Re-validate membership server-side: the form value is a routing hint, not authorization.
  if (!organizations.some((organization) => organization.id === target)) return

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, target, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
  })
  revalidatePath('/', 'layout')
}
