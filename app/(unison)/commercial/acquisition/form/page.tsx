import Link from 'next/link'

import { WorkPage } from '@/components/shared/work-page'
import { SERVICES } from '@/features/prospect-engagement/catalog'
import { getAcquisitionAdminData } from '@/features/prospect-engagement/admin-data'
import { FormVersionForm } from '@/features/prospect-engagement/components/form-version-form'

export default async function Page() {
  const data = await getAcquisitionAdminData()
  const current = data.versions.find((version) => version.status === 'published') ?? data.versions[0]
  const nextVersion = suggestVersion(current?.version ?? '1.0')
  return <WorkPage category="Commercial" title="Engagement form versions" description="Structured, approved wording with historical response meanings preserved." parent={{ label: 'Acquisition', href: '/commercial/acquisition' }}>
    <div className="mb-5 flex flex-wrap gap-2"><Link href="/engage" target="_blank" className="border border-border bg-card px-4 py-2 text-sm font-medium">Preview published form</Link></div>
    {current && data.canManage ? <FormVersionForm current={current.config} suggestedVersion={nextVersion} /> : null}
    <section className="mt-5 border border-border bg-card"><header className="border-b border-border p-5"><h2 className="font-semibold">Version history</h2><p className="mt-1 text-xs text-muted-foreground">Published answers retain their version even after wording changes.</p></header><div className="divide-y divide-border">{data.versions.map((version) => <div key={version.id} className="grid gap-3 p-5 md:grid-cols-[8rem_8rem_minmax(0,1fr)_12rem] md:items-center"><p className="font-semibold">Version {version.version}</p><span className={`w-fit px-2 py-1 text-[0.64rem] font-semibold uppercase ${version.status === 'published' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{version.status}</span><p className="text-sm text-muted-foreground">{version.config.headline} · {version.config.enabledServices.length} of {SERVICES.length} interests enabled</p><p className="text-xs text-muted-foreground">{new Date(version.publishedAt ?? version.createdAt).toLocaleString('en-ZA')}</p></div>)}</div></section>
  </WorkPage>
}

function suggestVersion(version: string) { const [major, minor] = version.split('.').map(Number); return `${Number.isFinite(major) ? major : 1}.${Number.isFinite(minor) ? minor + 1 : 1}` }

