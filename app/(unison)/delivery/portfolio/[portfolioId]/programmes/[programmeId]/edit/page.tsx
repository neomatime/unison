import { PortfolioForm } from '@/features/delivery/components/portfolio-form'
import { getProgramme } from '@/features/delivery/queries/portfolio-management'
import { notFound } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{portfolioId:string; programmeId: string }> }) { const {portfolioId, programmeId } = await params;const programme=await getProgramme(portfolioId,programmeId);if(!programme)notFound(); return <PortfolioForm kind="programme" portfolioId={portfolioId} programme={programme} /> }
