import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import {
  ACQUISITION_CHANNELS,
  SERVICE_IDS,
  labelForIndustry,
  labelForObjective,
  labelForService,
  labelForTimeline,
  type ServiceId,
} from '../catalog'
import type { EngagementDetails } from '../types'

export function LeadEngagementDetails({ engagements }: { engagements: EngagementDetails[] }) {
  if (!engagements.length) return null
  return (
    <WorkspaceSection title="Engagement Details" description={`${engagements.length} public enquir${engagements.length === 1 ? 'y' : 'ies'} retained with original attribution and form version.`}>
      <div className="divide-y divide-border">
        {engagements.map((engagement, index) => {
          const primary = SERVICE_IDS.includes(engagement.primaryService as ServiceId) ? engagement.primaryService as ServiceId : 'not-sure'
          const source = [engagement.sourceName, acquisitionLabel(engagement.channel), engagement.eventName, engagement.campaignName].filter(Boolean).join(' · ')
          return (
            <article key={engagement.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{index === 0 ? 'Latest enquiry' : `Earlier enquiry ${engagements.length - index}`}</p>
                <p className="text-xs text-muted-foreground">{new Date(engagement.submittedAt).toLocaleString('en-ZA')} · Form {engagement.formVersion}</p>
              </div>
              <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                <Fact label="Organisation" value={engagement.organisationName} />
                <Fact label="Primary interest" value={labelForService(engagement.primaryService)} />
                <Fact label="Objective" value={labelForObjective(primary, engagement.primaryObjective)} />
                <Fact label="Expected timeline" value={labelForTimeline(engagement.expectedTimeline)} />
                <Fact label="Selected services" value={engagement.selectedServices.map(labelForService).join(', ')} />
                <Fact label="Source" value={source || 'Corporate Website'} />
                <Fact label="Contact" value={[engagement.fullName, engagement.jobTitle].filter(Boolean).join(' · ')} />
                <Fact label="Preferred contact" value={engagement.preferredContact === 'telephone' ? `Telephone${engagement.phone ? ` · ${engagement.phone}` : ''}` : `Email · ${engagement.email}`} />
                <Fact label="Industry / Country" value={[labelForIndustry(engagement.industry), engagement.country].filter(Boolean).join(' · ')} />
                <Fact label="Marketing consent" value={engagement.marketingConsent ? 'Opted in' : 'Not opted in'} />
                <Fact label="Privacy acknowledgement" value={`Accepted · ${engagement.privacyNoticeVersion}`} />
              </dl>
              {engagement.additionalInformation ? <div className="mt-5 border-l-2 border-brand bg-muted/25 px-4 py-3"><p className="text-[0.67rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Additional information</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{engagement.additionalInformation}</p></div> : null}
            </article>
          )
        })}
      </div>
    </WorkspaceSection>
  )
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-[0.67rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</dt><dd className="mt-1 text-sm leading-5">{value || '—'}</dd></div> }
function acquisitionLabel(id: string) { return ACQUISITION_CHANNELS.find(([value]) => value === id)?.[1] ?? id }

