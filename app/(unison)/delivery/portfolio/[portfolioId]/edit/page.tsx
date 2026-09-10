import { PortfolioForm } from '@/features/delivery/components/portfolio-form'
import { getPortfolio } from '@/features/delivery/queries/portfolio-management'
import { notFound } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ portfolioId: string }> }) { const { portfolioId } = await params;const portfolio=await getPortfolio(portfolioId);if(!portfolio)notFound(); return <PortfolioForm portfolio={portfolio} /> }
