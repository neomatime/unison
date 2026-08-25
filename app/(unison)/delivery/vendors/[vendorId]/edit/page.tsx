import { VendorForm } from '@/features/delivery/components/vendor-form'

export default async function Page({ params }: { params: Promise<{ vendorId:string }> }) { const { vendorId } = await params; return <VendorForm mode="edit" vendorId={vendorId} /> }
