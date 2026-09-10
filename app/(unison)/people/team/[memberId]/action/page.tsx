import { redirect } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  redirect(`/people/team/${memberId}/edit`)
}
