import { redirect } from 'next/navigation'

// Provisioning is a single guided flow that creates the organisation; there is no
// separate register of setups, and organisations it creates are listed under Organisations.
export default function Page() {
  redirect('/internal/provisioning/new')
}
