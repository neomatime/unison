import { PortfolioDetailScreen } from '@/features/delivery/components/portfolio-detail-screen'
import { getExecutiveVisibility, getPortfolio, listProgrammes, listPortfolioProjectOptions } from '@/features/delivery/queries/portfolio-management'
import { notFound } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ portfolioId: string }> }) { const { portfolioId } = await params; const [portfolio,programmes,report,projects]=await Promise.all([getPortfolio(portfolioId),listProgrammes(portfolioId),getExecutiveVisibility(),listPortfolioProjectOptions(portfolioId)]);if(!portfolio)notFound();return <PortfolioDetailScreen portfolio={portfolio} programmes={programmes} report={report} projects={projects} /> }
