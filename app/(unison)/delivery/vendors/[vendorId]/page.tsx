import { VendorProfileScreen } from '@/features/delivery/components/vendor-profile-screen'

export default async function Page({ params }: { params: Promise<{ vendorId:string }> }) { const { vendorId } = await params; return <VendorProfileScreen vendorId={vendorId} /> }
