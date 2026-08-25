'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { domainFields } from '../domain-fields'
import type { MockRecord, ModuleDefinition } from '../types'
import { RecordCollectionWorkspace, type CollectionConfig, type CollectionField, type CollectionRecord } from './record-collection-workspace'
import { hasSpecialWorkspace, SpecialWorkspace } from './special-workspaces'

const fieldAliases: Record<string, string> = {
  Company: 'name', Contact: 'contact', Source: 'source', Owner: 'owner', 'Estimated Value': 'value', Status: 'status', 'Last Activity': 'updated',
  Quote: 'name', Client: 'client', Total: 'total', Expiry: 'expiry', Opportunity: 'name', 'Client / Prospect': 'client', Stage: 'status', Value: 'value', Probability: 'probability', 'Expected Close': 'close',
  Invoice: 'name', 'Issue Date': 'issueDate', 'Due Date': 'due', Balance: 'balance', Expense: 'name', Category: 'category', Vendor: 'vendor', Project: 'project', 'Submitted By': 'owner', Amount: 'amount', Date: 'date',
  Forecast: 'name', Period: 'period', Actual: 'actual', Projected: 'projected', Variance: 'variance', Confidence: 'confidence', Employee: 'name', 'Job Title': 'title', Department: 'department', Team: 'team', Manager: 'owner', 'Start Date': 'start',
  Record: 'name', Type: 'type', 'Due date': 'due',
}

const contextualActions: Record<string, string[]> = {
  leads: ['Qualify', 'Disqualify', 'Convert'],
  quotes: ['Submit', 'Send', 'Accept', 'Decline'],
  sales: ['Change Stage', 'Mark Won', 'Mark Lost'],
  invoices: ['Issue', 'Mark Paid', 'Cancel'],
  expenses: ['Submit', 'Approve', 'Reject'],
  forecast: ['Set Current', 'Duplicate Scenario'],
}

export function DomainModuleWorkspace({ module, records }: { module: ModuleDefinition; records: MockRecord[] }) {
  const router = useRouter()
  const [activeView, setActiveView] = useState('Register')
  const config = useMemo<CollectionConfig>(() => ({
    title: `${module.label} Register`,
    singular: module.singular,
    description: module.description,
    primaryAction: module.primaryAction,
    filters: [...module.filters],
    contextualActions: contextualActions[module.id],
    recordHref: (record) => `${module.route}/${record.id}`,
    records: records.map(toCollectionRecord),
    columns: module.columns.slice(0, 8).map((label) => ({ id: fieldAliases[label] ?? label.toLowerCase().replaceAll(' ', ''), label })),
    fields: (domainFields[module.id] ?? module.fields).map((field): CollectionField => ({
      id: field.name,
      label: field.label,
      type: field.type === 'textarea' || field.type === 'select' || field.type === 'date' ? field.type : 'text',
      required: field.required,
      options: field.options ? [...field.options] : undefined,
      placeholder: field.placeholder,
    })),
    detailTabs: [...module.tabs],
  }), [module, records])
  const views = ['Register', ...module.views]
  const special = activeView !== 'Register' && hasSpecialWorkspace(module.id, activeView)

  return <>
    <WorkspaceHeader category={module.category} title={module.label} />
    <p className="-mt-4 mb-5 max-w-3xl text-sm text-muted-foreground">{module.description}</p>
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label={`${module.label} views`}>{views.map((view) => <button type="button" key={view} onClick={() => setActiveView(view)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${activeView === view ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{view}</button>)}</nav>
    {special ? <SpecialWorkspace moduleId={module.id} view={activeView} /> : <RecordCollectionWorkspace config={{ ...config, title: activeView === 'Register' ? config.title : `${activeView} ${module.label}` }} onPrimaryAction={() => router.push(`${module.route}/new`)} />}
  </>
}

function toCollectionRecord(record: MockRecord): CollectionRecord {
  return {
    ...record,
    id: record.id,
    name: record.name,
    context: record.client ?? record.project ?? record.type ?? 'HIMARK workspace',
    status: record.status,
    owner: record.owner,
    updated: record.updated,
    archived: /archived|inactive|cancelled/i.test(record.status),
  }
}
