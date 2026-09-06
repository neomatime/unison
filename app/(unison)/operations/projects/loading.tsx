import { LoadingSkeleton } from '@/components/shared/state-feedback'

export default function ProjectsLoading() {
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><LoadingSkeleton /></section>
}
