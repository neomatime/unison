// `no-access` covers two distinct server-side outcomes: no organization
// matches the account's domain, and an existing membership was revoked.
// They must render identically — telling a removed employee that their
// account exists but is suspended tells them something they do not need
// to know. Do not split this into more specific messages.
const MESSAGES: Record<string, string> = {
  'no-access': 'This Microsoft account isn’t linked to a UNISON organization. Ask your administrator for access.',
  microsoft: 'Microsoft sign-in didn’t complete. Try again.',
}

export function signInErrorMessage(error: string | undefined): string | undefined {
  if (!error) return undefined
  return MESSAGES[error]
}
