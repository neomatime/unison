import { redirect } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  redirect(`/internal/tenants/${tenantId}`)
}
