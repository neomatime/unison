import { PortfolioDetailScreen } from '@/features/delivery/components/portfolio-detail-screen'

export default async function Page({ params }: { params: Promise<{ portfolioId: string }> }) { const { portfolioId } = await params; return <PortfolioDetailScreen portfolioId={portfolioId} /> }
