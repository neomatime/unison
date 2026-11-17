import { redirect } from 'next/navigation'

// Team members are not added by hand: a person appears on the Team page when they sign in with their HIMARK Microsoft account.
export default function Page() {
  redirect('/people/team')
}
