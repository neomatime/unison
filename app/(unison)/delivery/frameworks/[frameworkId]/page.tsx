import { FrameworkDetailScreen } from '@/features/delivery/components/framework-detail-screen'

export default async function Page({ params }: { params: Promise<{ frameworkId:string }> }) { const { frameworkId } = await params; return <FrameworkDetailScreen frameworkId={frameworkId} /> }
