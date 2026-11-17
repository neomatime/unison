import { PublicThemeScript } from '@/components/layout/public-theme'
import { AuthScreen } from '@/features/auth-ui/auth-screen'
export default function Page() { return <><PublicThemeScript /><AuthScreen kind="verify" /></> }
