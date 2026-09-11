import { redirect } from 'next/navigation'

// The slug must match the sibling [employeeId] routes. Next.js refuses to boot
// when one dynamic segment is spelled two ways at the same position, and this
// shim previously used [memberId], which stopped `next dev` starting at all.
export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  redirect(`/people/team/${employeeId}/edit`)
}
