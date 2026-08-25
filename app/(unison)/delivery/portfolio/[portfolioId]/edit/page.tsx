import { PortfolioForm } from '@/features/delivery/components/portfolio-form'

export default async function Page({ params }: { params: Promise<{ portfolioId: string }> }) { const { portfolioId } = await params; return <PortfolioForm mode="edit" portfolioId={portfolioId} /> }
