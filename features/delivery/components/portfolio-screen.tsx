'use client'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { RecordCollectionWorkspace } from '@/features/product-ui/components/record-collection-workspace'
import { deliveryMetrics, deliveryPhases } from '../data'
import { portfolios } from '../portfolio-data'
import { MetricGrid, PhaseStepper, RiskList, SectionCard } from './delivery-primitives'

const portfolioMetrics = deliveryMetrics.map((item, index) => index === 0 ? ['Active Portfolios', '3', '8 active programmes'] as const : item)

export function PortfolioScreen() {
  return <>
    <WorkspaceHeader category="Delivery" title="Project Portfolio" description="Monitor programme health, portfolio risk, governance performance and delivery outcomes." action="New Portfolio" actionHref="/delivery/portfolio/new" />
    <MetricGrid items={portfolioMetrics} />
    <SectionCard title="Portfolio distribution across framework" description="Project concentration by lifecycle phase." className="mt-5"><div className="p-5"><PhaseStepper phases={deliveryPhases} /></div></SectionCard>
    <div className="mt-5"><RecordCollectionWorkspace config={{
      title:'Portfolio Register', singular:'Portfolio', description:'Governed portfolios in the active organization.', primaryAction:'New Portfolio', records:portfolios,
      filters:['Owner','Sponsor','Framework','Health','Date'],
      columns:[{id:'name',label:'Portfolio'},{id:'code',label:'Code'},{id:'owner',label:'Owner'},{id:'sponsor',label:'Sponsor'},{id:'projects',label:'Projects'},{id:'health',label:'Health'},{id:'status',label:'Status'},{id:'updated',label:'Updated'}],
      fields:[{id:'name',label:'Portfolio Name',required:true},{id:'code',label:'Portfolio Code',required:true},{id:'context',label:'Description',type:'textarea',required:true},{id:'owner',label:'Owner',type:'select',options:['Neo Morake','Amara Dlamini','Thabo Mokoena']},{id:'sponsor',label:'Sponsor'},{id:'businessUnit',label:'Business Unit'},{id:'status',label:'Status',type:'select',options:['Planning','Active','Under Review','On Hold']},{id:'visibility',label:'Visibility',type:'select',options:['Organization','Members only','Restricted']}],
      contextualActions:['Move','Assign Owner'], emptyDescription:'Create the first portfolio to organise programmes, projects, governance and benefits.',
    }} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <PortfolioPanel title="Portfolios requiring attention" items={['Operational Resilience · At Risk','Strategic Transformation · Watch','Customer Experience · On Track']} />
      <PortfolioPanel title="Upcoming governance events" items={['Claims steering committee · Today','Benefits baseline review · 04 Sep','Portfolio risk review · 08 Sep']} />
      <PortfolioPanel title="Vendor exposure" items={['Twilio · Critical exposure','TIAL · SLA below target','Dimension Data · Compliance gap']} />
      <SectionCard title="Governance exceptions" description="Portfolio risks requiring executive oversight." className="lg:col-span-2 xl:col-span-3"><RiskList items={[
        { title: 'Five governance gates are overdue', meta: 'Two are blocking downstream workstreams', severity: 'danger' },
        { title: 'Three vendor obligations lack confirmed evidence', meta: 'Commercial owners have been notified', severity: 'warning' },
        { title: 'Two benefits baselines require re-approval', meta: 'Forecast impact: R1.6M', severity: 'info' },
      ]} /></SectionCard>
    </div>
  </>
}

function PortfolioPanel({ title, items }: { title: string; items: string[] }) { return <SectionCard title={title}><div className="divide-y divide-border">{items.map((item) => <div key={item} className="px-5 py-3.5 text-sm font-medium">{item}</div>)}</div></SectionCard> }
