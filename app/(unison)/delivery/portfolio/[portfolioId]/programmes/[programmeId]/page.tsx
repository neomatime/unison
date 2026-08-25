import { ProgrammeDetailScreen } from '@/features/delivery/components/programme-detail-screen'

export default async function Page({ params }: { params: Promise<{ portfolioId: string; programmeId: string }> }) { const { portfolioId, programmeId } = await params; return <ProgrammeDetailScreen portfolioId={portfolioId} programmeId={programmeId} /> }
