import { DocumentUploadPage } from '@/features/delivery/components/project-documents-workspace'

export default async function Page({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const { return: requested } = await searchParams
  const returnHref = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/overview'
  return <DocumentUploadPage returnHref={returnHref} />
}
