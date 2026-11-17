import { AuthScreen } from '@/features/auth-ui/auth-screen'
import { mayChoosePassword } from '@/features/auth-ui/password-policy'
import { createServerSupabase } from '@/lib/supabase/server'

// The new-password form opens only for a session started from a reset link an administrator sent. Anyone else, signed in or not,
// is told passwords are managed by their administrator.
export default async function Page() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return <AuthScreen kind={mayChoosePassword(user) ? 'reset' : 'forgot'} />
}
