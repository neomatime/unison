'use client'

import { AlertTriangle, CheckCircle2, LoaderCircle, Upload } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

import { WorkPage } from '@/components/shared/work-page'
import { RecordCollectionWorkspace, type CollectionRecord } from '@/features/product-ui/components/record-collection-workspace'

const documents: CollectionRecord[] = []

export function ProjectDocumentsWorkspace() {
  const pathname = usePathname()
  return <RecordCollectionWorkspace onPrimaryAction={() => window.location.assign(`/records/documents/upload?return=${encodeURIComponent(pathname)}`)} config={{
    title: 'Project Documents & Evidence', singular: 'Document', description: 'Controlled project files, evidence, versions and record links.', primaryAction: 'Upload Document', records: documents,
    filters: ['Type', 'Classification', 'Linked Record', 'Owner'], allowLink: true,
    columns: [{ id: 'name', label: 'Name' }, { id: 'type', label: 'Type' }, { id: 'classification', label: 'Classification' }, { id: 'linked', label: 'Linked Record' }, { id: 'version', label: 'Version' }, { id: 'owner', label: 'Owner' }, { id: 'updated', label: 'Last Updated' }, { id: 'status', label: 'Status' }],
    fields: [{ id: 'name', label: 'Document Name', required: true }, { id: 'context', label: 'Description', type: 'textarea' }, { id: 'classification', label: 'Classification', type: 'select', options: ['Project Evidence', 'Requirements', 'Compliance', 'Design Artefact', 'Commercial'] }, { id: 'owner', label: 'Owner', type: 'select', options: ['Neo Morake', 'Naledi Maseko', 'Thabo Mokoena', 'Mia Daniels'] }, { id: 'confidentiality', label: 'Confidentiality', type: 'select', options: ['Internal', 'Confidential', 'Restricted'] }, { id: 'tags', label: 'Tags' }],
    detailTabs: ['Preview', 'Details', 'Linked records', 'Version History', 'Activity'], contextualActions: ['Download', 'Rename', 'Replace File', 'New Version', 'Link', 'Move'], emptyDescription: 'Upload your first project document to begin controlling evidence and delivery artefacts.',
  }} />
}

const steps = ['select', 'queue', 'metadata', 'success'] as const
type UploadStep = (typeof steps)[number]

export function DocumentUploadPage({ returnHref }: { returnHref: string }) {
  const router = useRouter()
  const [step, setStep] = useState<UploadStep>('select')
  const [removed, setRemoved] = useState(false)
  const currentStep = steps.indexOf(step)
  const queue = [
    { name: 'UAT execution evidence.pdf', size: '2.8 MB', state: 'complete', progress: 100 },
    { name: 'requirements-traceability.xlsx', size: '1.4 MB', state: 'uploading', progress: 68 },
    { name: 'solution-design-v4.pdf', size: '5.6 MB', state: 'duplicate', progress: 0 },
    { name: 'malware-scan.tmp', size: '890 KB', state: 'unsupported', progress: 0 },
  ]

  return <WorkPage category="Documents & Evidence" title="Upload project documents" description="Add files, review upload results and confirm governed metadata." parent={{ label: 'Return to record', href: returnHref }} guidance={<><p className="font-semibold text-foreground">Evidence handling</p><p className="mt-2">Classification, ownership, confidentiality and linked records are confirmed before documents enter the register.</p></>}>
    <section className="border border-border bg-card">
      <header className="border-b border-border p-6"><div className="grid grid-cols-4 gap-2">{['Select files', 'Review queue', 'Metadata', 'Complete'].map((label, index) => <div key={label} className={`border-b-2 pb-2 text-xs font-semibold ${index === currentStep ? 'border-brand text-brand' : index < currentStep ? 'border-success text-success' : 'border-border text-muted-foreground'}`}>{index + 1}. {label}</div>)}</div></header>
      <div className="min-h-[420px] p-6 lg:p-8">
        {step === 'select' ? <><div className="border-2 border-dashed border-border p-12 text-center"><Upload className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">Drag and drop files here</h2><p className="mt-1 text-sm text-muted-foreground">PDF, DOCX, XLSX, CSV, PNG or JPG · Multiple files supported</p><button type="button" onClick={() => setStep('queue')} className="mt-6 bg-brand px-4 py-2 text-sm font-semibold text-white">Choose files</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[['Encrypted in transit', 'Secure transfer'], ['50 MB per file', 'Maximum size'], ['Version controlled', 'Duplicate handling']].map(([value, label]) => <div key={label} className="bg-muted/50 p-4"><p className="text-xs font-semibold">{value}</p><p className="mt-1 text-[0.65rem] text-muted-foreground">{label}</p></div>)}</div></> : null}
        {step === 'queue' ? <div className="space-y-3">{queue.filter((file) => !(removed && file.state === 'unsupported')).map((file) => <div key={file.name} className="border border-border p-4"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center bg-muted">{file.state === 'complete' ? <CheckCircle2 className="size-4 text-success" /> : file.state === 'uploading' ? <LoaderCircle className="size-4 animate-spin text-brand" /> : <AlertTriangle className="size-4 text-warning" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{file.size} · {file.state === 'complete' ? 'Uploaded' : file.state === 'uploading' ? 'Uploading…' : file.state === 'duplicate' ? 'A file with this name already exists' : 'Unsupported file type'}</p></div>{file.state === 'duplicate' ? <select className="h-9 border border-border bg-card px-2 text-xs"><option>Create new version</option><option>Rename file</option><option>Skip</option></select> : file.state === 'unsupported' ? <button type="button" onClick={() => setRemoved(true)} className="border border-border px-3 py-2 text-xs font-semibold">Remove</button> : null}</div>{file.progress ? <div className="mt-3 h-1.5 bg-muted"><div style={{ width: `${file.progress}%` }} className="h-full bg-brand" /></div> : null}</div>)}</div> : null}
        {step === 'metadata' ? <div className="space-y-5"><div className="flex items-center gap-3 border border-success/25 bg-success-soft p-4"><CheckCircle2 className="size-5 text-success" /><div><p className="text-sm font-semibold">Three files ready</p><p className="text-xs text-muted-foreground">Confirm shared metadata before completing the upload.</p></div></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Classification" options={['Project Evidence', 'Requirements', 'Compliance', 'Design Artefact']} /><Field label="Owner" options={['Naledi Maseko', 'Thabo Mokoena', 'Mia Daniels']} /><Field label="Confidentiality" options={['Internal', 'Confidential', 'Restricted']} /><Field label="Linked record" options={['UAT Sign-off Gate', 'Requirement Baseline v2', 'POPIA Approval']} /><label className="text-sm font-medium sm:col-span-2">Description<textarea rows={4} className="mt-2 w-full border border-border bg-background p-3 text-sm" placeholder="Describe how these files support project delivery or governance." /></label></div></div> : null}
        {step === 'success' ? <div className="p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-bold">Upload complete</h2><p className="mt-2 text-sm text-muted-foreground">Documents are ready to appear in the linked record’s evidence register.</p></div> : null}
      </div>
      <footer className="flex items-center justify-between border-t border-border p-5"><Link href={returnHref} className="border border-border px-4 py-2 text-sm font-medium">{step === 'success' ? 'Close' : 'Cancel'}</Link>{step !== 'success' ? <button type="button" onClick={() => setStep(steps[Math.min(currentStep + 1, steps.length - 1)])} className="bg-brand px-4 py-2 text-sm font-semibold text-white">{step === 'metadata' ? 'Upload documents' : 'Continue'}</button> : <button type="button" onClick={() => router.push(returnHref)} className="bg-brand px-4 py-2 text-sm font-semibold text-white">View documents</button>}</footer>
    </section>
  </WorkPage>
}

function Field({ label, options }: { label: string; options: string[] }) { return <label className="text-sm font-medium">{label}<select className="mt-2 h-11 w-full border border-border bg-background px-3 text-sm">{options.map((option) => <option key={option}>{option}</option>)}</select></label> }
