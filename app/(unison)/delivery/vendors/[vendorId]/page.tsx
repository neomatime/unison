import { PhaseFourDetail } from '@/features/operations/components/phase-four-detail'

export default async function Page({ params }: { params: Promise<{ vendorId:string }> }) { const { vendorId } = await params; return <PhaseFourDetail kind="vendor" id={vendorId} /> }
