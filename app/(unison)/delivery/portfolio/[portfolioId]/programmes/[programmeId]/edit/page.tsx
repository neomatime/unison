import { PortfolioForm } from '@/features/delivery/components/portfolio-form'

export default async function Page({ params }: { params: Promise<{ programmeId: string }> }) { const { programmeId } = await params; return <PortfolioForm kind="programme" mode="edit" portfolioId={programmeId} /> }
