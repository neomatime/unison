import 'server-only'
import { getGraphAccessToken } from '@/lib/email/graph'
import { directoryPeople, type DirectoryResult } from './microsoft-directory-model'

// Reads the organisation's Microsoft 365 user list with the app registration that already sends UNISON's mail
// (client-credentials). Needs the User.Read.All application permission with admin consent. Read only.
// A missing permission never breaks the Team page: the caller falls back to the people who have signed in with Microsoft.

export async function listDirectoryPeople(domain: string | null | undefined): Promise<DirectoryResult> {
  let token: string
  try {
    token = await getGraphAccessToken()
  } catch {
    return { ok: false, reason: 'not-configured' }
  }
  const rows: unknown[] = []
  let url: string | null = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled,userType&$top=100'
  try {
    for (let page = 0; url && page < 20; page += 1) {
      const response: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        console.error(`Microsoft directory read failed (${response.status}): ${detail.slice(0, 300)}`)
        return { ok: false, reason: response.status === 401 || response.status === 403 ? 'permission' : 'other' }
      }
      const body = (await response.json()) as { value?: unknown[]; '@odata.nextLink'?: string }
      rows.push(...(body.value ?? []))
      url = body['@odata.nextLink'] ?? null
    }
  } catch (error) {
    console.error('Microsoft directory read failed', error instanceof Error ? error.message : error)
    return { ok: false, reason: 'other' }
  }
  return { ok: true, people: directoryPeople(rows, domain) }
}
