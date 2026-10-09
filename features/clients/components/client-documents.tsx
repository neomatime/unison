import { ProjectDocumentsWorkspace } from '@/features/delivery/components/project-documents-workspace'

// Documents is the only related-records section a client page offers: it is a real
// upload workspace. Projects, tasks and the commercial records live in their own modules.
export function ClientDocuments() {
  return (
    <section className="mt-5">
      <h2 className="border-b border-border pb-3 text-sm font-semibold">Documents</h2>
      <div className="mt-5">
        <ProjectDocumentsWorkspace />
      </div>
    </section>
  )
}
