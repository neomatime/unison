import { FrameworkForm } from '@/features/delivery/components/framework-form'

export default async function Page({ params }: { params: Promise<{ frameworkId:string }> }) { const { frameworkId } = await params; return <FrameworkForm mode="edit" frameworkId={frameworkId} /> }
