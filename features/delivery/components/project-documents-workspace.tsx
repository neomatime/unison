'use client'

import { AlertTriangle, CheckCircle2, FileText, LoaderCircle, Upload, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { WorkPage } from '@/components/shared/work-page'
import { createBrowserSupabase } from '@/lib/supabase/client'

type DocumentRecord = {
  id: string
  display_name: string
  mime_type: string
  file_size: number
  classification: string
  confidentiality: string
  version: number
  description: string | null
  linked_path: string | null
  created_at: string
}

type QueuedFile = { file: File; id: string; state: 'ready' | 'uploading' | 'complete' | 'error'; error?: string }

const acceptedTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'image/png',
  'image/jpeg',
])
const maxFileSize = 50 * 1024 * 1024

export function ProjectDocumentsWorkspace() {
  const pathname = usePathname()
  const { organization } = useShellContext()
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createBrowserSupabase(), [])

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await (supabase as any)
      .from('documents')
      .select('id,display_name,mime_type,file_size,classification,confidentiality,version,description,linked_path,created_at')
      .eq('organization_id', organization.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (queryError) return setError(queryError.message)
    setError('')
    setDocuments((data ?? []) as DocumentRecord[])
  }, [organization.id, supabase])

  useEffect(() => { void loadDocuments() }, [loadDocuments])
  useEffect(() => {
    const channel = supabase.channel(`documents:${organization.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `organization_id=eq.${organization.id}` }, () => void loadDocuments())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadDocuments, organization.id, supabase])

  return <section className="overflow-hidden rounded-xl border border-border bg-card">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div><h2 className="unison-section-title text-xs">Project Documents &amp; Evidence</h2><p className="mt-1 text-xs text-muted-foreground">Private, controlled files with classification and linked-record context.</p></div>
      <Link href={`/records/documents/upload?return=${encodeURIComponent(pathname)}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-white"><Upload className="size-3.5" />Upload document</Link>
    </header>
    {loading ? <div className="flex min-h-56 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-brand" /><span className="sr-only">Loading documents</span></div> : error ? <div className="m-5 border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"><p className="font-semibold">Documents could not be loaded.</p><p className="mt-1">{error}</p><button type="button" onClick={() => void loadDocuments()} className="mt-3 border border-destructive/25 px-3 py-2 text-xs font-semibold">Try again</button></div> : documents.length ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left"><thead><tr className="bg-muted/30 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{['Document', 'Classification', 'Confidentiality', 'Version', 'Size', 'Uploaded'].map((label) => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody>{documents.map((document) => <tr key={document.id} className="border-t border-border hover:bg-muted/25"><td className="px-5 py-3.5"><a href={`/api/documents/${document.id}/download`} className="unison-record-name inline-flex items-center gap-2 text-sm hover:text-brand hover:underline"><FileText className="size-4" />{document.display_name}</a>{document.description ? <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">{document.description}</p> : null}</td><td className="px-5 py-3.5 text-xs">{document.classification}</td><td className="px-5 py-3.5 text-xs text-muted-foreground">{document.confidentiality}</td><td className="px-5 py-3.5 text-xs">v{document.version}</td><td className="px-5 py-3.5 text-xs text-muted-foreground">{formatBytes(document.file_size)}</td><td className="px-5 py-3.5 text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(new Date(document.created_at))}</td></tr>)}</tbody></table></div> : <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FileText className="size-5" /></span><h3 className="mt-4 font-semibold">No documents yet</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Upload the first governed document. Files are stored privately and available only to members of this organization.</p><Link href={`/records/documents/upload?return=${encodeURIComponent(pathname)}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"><Upload className="size-4" />Upload document</Link></div>}
  </section>
}

export function DocumentUploadPage({ returnHref }: { returnHref: string }) {
  const router = useRouter()
  const { organization } = useShellContext()
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [classification, setClassification] = useState('Project Evidence')
  const [confidentiality, setConfidentiality] = useState('Internal')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createBrowserSupabase(), [])

  const linked = useMemo(() => parseLinkedRecord(returnHref), [returnHref])

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => {
      const issue = !acceptedTypes.has(file.type) ? 'Unsupported file type.' : file.size <= 0 || file.size > maxFileSize ? 'Files must be between 1 byte and 50 MB.' : undefined
      return { file, id: crypto.randomUUID(), state: issue ? 'error' as const : 'ready' as const, error: issue }
    })
    setQueue((current) => [...current, ...next])
    setMessage('')
  }

  async function uploadFiles() {
    const pending = queue.filter((item) => item.state === 'ready' || item.state === 'error' && !item.error)
    if (!pending.length) return setMessage('Choose at least one supported file.')
    setUploading(true)
    setMessage('')
    let successCount = 0
    for (const item of pending) {
      setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: 'uploading', error: undefined } : entry))
      const safeName = item.file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
      const storagePath = `${organization.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, item.file, { contentType: item.file.type, upsert: false })
      if (uploadError) {
        setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: 'error', error: uploadError.message } : entry))
        continue
      }
      const { error: metadataError } = await (supabase as any).from('documents').insert({
        organization_id: organization.id,
        display_name: item.file.name,
        storage_path: storagePath,
        mime_type: item.file.type,
        file_size: item.file.size,
        classification,
        confidentiality,
        description: description.trim() || null,
        linked_record_type: linked.type,
        linked_record_id: linked.id,
        linked_path: returnHref,
      })
      if (metadataError) {
        await supabase.storage.from('documents').remove([storagePath])
        setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: 'error', error: metadataError.message } : entry))
        continue
      }
      successCount += 1
      setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: 'complete', error: undefined } : entry))
    }
    setUploading(false)
    if (successCount) {
      await (supabase as any).from('notifications').insert({ organization_id: organization.id, category: 'Documents', title: `${successCount} document${successCount === 1 ? '' : 's'} uploaded`, body: `Files were added to ${returnHref}.`, href: returnHref })
    }
    if (successCount === pending.length) setComplete(true)
    else setMessage(`${successCount} of ${pending.length} files uploaded. Review the errors and try again.`)
  }

  return <WorkPage category="Documents & Evidence" title="Upload project documents" description="Store files privately and attach governed metadata before they enter the register." parent={{ label: 'Return to record', href: returnHref }} guidance={<><p className="font-semibold text-foreground">Secure document handling</p><p className="mt-2">Files are stored in a private organization folder. Every download uses a short-lived signed link after access is checked.</p></>}>
    <section className="border border-border bg-card">
      {complete ? <div className="p-14 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-bold">Upload complete</h2><p className="mt-2 text-sm text-muted-foreground">Your documents and metadata are now available to organization members.</p><button type="button" onClick={() => router.push(returnHref)} className="mt-6 bg-brand px-4 py-2 text-sm font-semibold text-white">View documents</button></div> : <>
        <div className="p-6 lg:p-8">
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => event.target.files && addFiles(event.target.files)} />
          <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }} className="w-full border-2 border-dashed border-border p-10 text-center transition-colors hover:border-brand hover:bg-brand-soft/15"><Upload className="mx-auto size-8 text-muted-foreground" /><span className="mt-4 block font-semibold">Choose files or drop them here</span><span className="mt-1 block text-sm text-muted-foreground">PDF, DOCX, XLSX, CSV, PNG or JPG · up to 50 MB each</span></button>
          {queue.length ? <div className="mt-5 space-y-2">{queue.map((item) => <div key={item.id} className="flex items-center gap-3 border border-border p-3"><span className="flex size-9 items-center justify-center bg-muted">{item.state === 'complete' ? <CheckCircle2 className="size-4 text-success" /> : item.state === 'uploading' ? <LoaderCircle className="size-4 animate-spin text-brand" /> : item.state === 'error' ? <AlertTriangle className="size-4 text-destructive" /> : <FileText className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.file.name}</p><p className={`text-xs ${item.error ? 'text-destructive' : 'text-muted-foreground'}`}>{item.error ?? `${formatBytes(item.file.size)} · ${item.state}`}</p></div>{!uploading && item.state !== 'complete' ? <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setQueue((current) => current.filter((entry) => entry.id !== item.id))} className="p-2 text-muted-foreground hover:text-foreground"><X className="size-4" /></button> : null}</div>)}</div> : null}
          <div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="Classification" value={classification} onChange={setClassification} options={['Project Evidence', 'Requirements', 'Compliance', 'Design Artefact', 'Commercial', 'Other']} /><Field label="Confidentiality" value={confidentiality} onChange={setConfidentiality} options={['Internal', 'Confidential', 'Restricted']} /><label className="text-sm font-medium sm:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-2 w-full border border-border bg-background p-3 text-sm" placeholder="Explain how these files support delivery or governance." /></label></div>
          {message ? <p role="alert" className="mt-5 border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{message}</p> : null}
        </div>
        <footer className="flex items-center justify-between border-t border-border p-5"><Link href={returnHref} className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="button" disabled={uploading || queue.every((item) => item.state !== 'ready')} onClick={() => void uploadFiles()} className="inline-flex items-center gap-2 bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{uploading ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}{uploading ? 'Uploading…' : 'Upload documents'}</button></footer>
      </>}
    </section>
  </WorkPage>
}

function Field({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full border border-border bg-background px-3 text-sm">{options.map((option) => <option key={option}>{option}</option>)}</select></label>
}

function parseLinkedRecord(path: string) {
  const match = path.match(/^\/(?:delivery|operations|commercial|finance|people)\/([^/]+)\/([0-9a-f-]{36})(?:\/|$)/i)
  return { type: match?.[1] ?? null, id: match?.[2] ?? null }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}
