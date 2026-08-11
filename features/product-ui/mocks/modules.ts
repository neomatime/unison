import type { MockRecord } from '../types'

const owners = ['Neo Morake', 'Amara Dlamini', 'Lethabo Nkosi', 'Zanele Khumalo']
const companies = ['Meridian Advisory', 'Northstar Capital', 'Aurelia Studios', 'Copperleaf Partners']

export const moduleFixtures: Record<string, MockRecord[]> = {
  clients: [
    { id: 'lgndry-co', name: 'LGNDRY.CO', status: 'Onboarding', owner: owners[0], updated: 'Just now', contact: 'Sarah Mokoena', service: 'Growth Partner', projects: '0', health: 'New' },
    { id: 'meridian-advisory', name: 'Meridian Advisory', status: 'Active', owner: owners[0], updated: '12 min ago', contact: 'Naledi Mokoena', service: 'Growth Strategy', projects: '3', health: 'Healthy' },
    { id: 'northstar-capital', name: 'Northstar Capital', status: 'Active', owner: owners[1], updated: '1 hour ago', contact: 'Daniel Naidoo', service: 'Brand Transformation', projects: '2', health: 'Watch' },
    { id: 'aurelia-studios', name: 'Aurelia Studios', status: 'Onboarding', owner: owners[2], updated: 'Yesterday', contact: 'Imani Jacobs', service: 'Digital Platform', projects: '1', health: 'Healthy' },
    { id: 'copperleaf-partners', name: 'Copperleaf Partners', status: 'Archived', owner: owners[3], updated: '6 days ago', contact: 'Tariq Adams', service: 'Advisory Retainer', projects: '0', health: 'Stable' },
  ],
  projects: [
    { id: 'meridian-growth-programme', name: 'Meridian Growth Programme', status: 'On Track', owner: owners[0], updated: '8 min ago', client: companies[0], progress: '74%', milestone: 'Executive workshop', due: '28 Aug 2026' },
    { id: 'northstar-rebrand', name: 'Northstar Brand Transformation', status: 'At Risk', owner: owners[1], updated: '40 min ago', client: companies[1], progress: '58%', milestone: 'Identity approval', due: '04 Sep 2026' },
    { id: 'aurelia-platform', name: 'Aurelia Client Platform', status: 'On Track', owner: owners[2], updated: 'Yesterday', client: companies[2], progress: '39%', milestone: 'Prototype review', due: '19 Sep 2026' },
  ],
  tasks: [
    { id: 'task-brief', name: 'Approve Meridian workshop brief', status: 'Today', owner: owners[0], updated: '5 min ago', project: 'Meridian Growth Programme', priority: 'High', due: 'Today, 14:00' },
    { id: 'task-budget', name: 'Review Q3 campaign budget', status: 'In Progress', owner: owners[1], updated: '25 min ago', project: 'Northstar Brand Transformation', priority: 'Medium', due: 'Tomorrow' },
    { id: 'task-prototype', name: 'Prepare prototype walkthrough', status: 'Upcoming', owner: owners[2], updated: '2 hours ago', project: 'Aurelia Client Platform', priority: 'High', due: '14 Aug 2026' },
  ],
  calendar: [
    { id: 'event-exec', name: 'Meridian executive workshop', status: 'Confirmed', owner: owners[0], updated: 'Today', source: 'Client Meeting', date: '12 Aug 2026', time: '10:00–12:00' },
    { id: 'event-review', name: 'Northstar identity review', status: 'Tentative', owner: owners[1], updated: 'Today', source: 'Milestone', date: '13 Aug 2026', time: '14:30–15:30' },
  ],
  leads: [
    { id: 'riverton-group', name: 'Riverton Group', status: 'Qualified', owner: owners[0], updated: '18 min ago', contact: 'Sibusiso Molefe', source: 'Referral', value: 'R480K' },
    { id: 'harbour-industries', name: 'Harbour Industries', status: 'New', owner: owners[1], updated: '2 hours ago', contact: 'Maya Petersen', source: 'Website', value: 'R260K' },
    { id: 'veridian-health', name: 'Veridian Health', status: 'Discovery', owner: owners[2], updated: 'Yesterday', contact: 'Thandi Ncube', source: 'Event', value: 'R720K' },
  ],
  quotes: [
    { id: 'quo-2048', name: 'QUO-2048', status: 'Sent', owner: owners[0], updated: '30 min ago', client: companies[0], total: 'R284,500', expiry: '25 Aug 2026' },
    { id: 'quo-2047', name: 'QUO-2047', status: 'Internal Review', owner: owners[1], updated: '3 hours ago', client: 'Riverton Group', total: 'R468,000', expiry: '31 Aug 2026' },
    { id: 'quo-2046', name: 'QUO-2046', status: 'Accepted', owner: owners[2], updated: 'Yesterday', client: companies[2], total: 'R192,750', expiry: '18 Aug 2026' },
  ],
  sales: [
    { id: 'riverton-transformation', name: 'Riverton Transformation', status: 'Proposal', owner: owners[0], updated: '22 min ago', client: 'Riverton Group', value: 'R480K', probability: '65%', close: '30 Sep 2026' },
    { id: 'harbour-strategy', name: 'Harbour Growth Strategy', status: 'Discovery', owner: owners[1], updated: '2 hours ago', client: 'Harbour Industries', value: 'R260K', probability: '40%', close: '15 Oct 2026' },
    { id: 'veridian-platform', name: 'Veridian Digital Platform', status: 'Negotiation', owner: owners[2], updated: 'Yesterday', client: 'Veridian Health', value: 'R720K', probability: '80%', close: '18 Sep 2026' },
  ],
  invoices: [
    { id: 'inv-1328', name: 'INV-1328', status: 'Paid', owner: owners[0], updated: '10 min ago', client: companies[0], total: 'R148,500', balance: 'R0', due: '08 Aug 2026' },
    { id: 'inv-1327', name: 'INV-1327', status: 'Overdue', owner: owners[1], updated: '1 hour ago', client: companies[1], total: 'R96,000', balance: 'R96,000', due: '05 Aug 2026' },
    { id: 'inv-1326', name: 'INV-1326', status: 'Issued', owner: owners[2], updated: 'Yesterday', client: companies[2], total: 'R72,750', balance: 'R72,750', due: '24 Aug 2026' },
  ],
  expenses: [
    { id: 'exp-441', name: 'Executive workshop venue', status: 'Awaiting Approval', owner: owners[0], updated: '16 min ago', category: 'Events', vendor: 'The Forum', amount: 'R18,600', date: '10 Aug 2026' },
    { id: 'exp-440', name: 'Research subscriptions', status: 'Approved', owner: owners[1], updated: 'Yesterday', category: 'Software', vendor: 'Insight Library', amount: 'R6,450', date: '09 Aug 2026' },
  ],
  forecast: [
    { id: 'base-q3', name: 'Q3 Base Scenario', status: 'Active', owner: owners[0], updated: 'Today', period: 'Q3 2026', actual: 'R2.4M', projected: 'R3.8M', variance: '+6.2%' },
    { id: 'growth-q4', name: 'Q4 Growth Scenario', status: 'Draft', owner: owners[1], updated: 'Yesterday', period: 'Q4 2026', actual: '—', projected: 'R4.6M', variance: '+18.4%' },
  ],
  team: [
    { id: 'neo-morake', name: 'Neo Morake', status: 'Active', owner: 'HIMARK Board', updated: 'Today', title: 'Chief Executive Officer', department: 'Executive', team: 'Leadership', start: '01 Jan 2023' },
    { id: 'amara-dlamini', name: 'Amara Dlamini', status: 'Active', owner: 'Neo Morake', updated: 'Today', title: 'Strategy Director', department: 'Consulting', team: 'Growth', start: '12 Feb 2024' },
    { id: 'lethabo-nkosi', name: 'Lethabo Nkosi', status: 'Active', owner: 'Amara Dlamini', updated: 'Yesterday', title: 'Product Lead', department: 'Digital', team: 'Platforms', start: '06 May 2025' },
    { id: 'zanele-khumalo', name: 'Zanele Khumalo', status: 'On Leave', owner: 'Neo Morake', updated: '2 days ago', title: 'Finance Manager', department: 'Finance', team: 'Operations', start: '18 Sep 2023' },
  ],
  hr: [
    { id: 'vacancy-designer', name: 'Senior Experience Designer', status: 'Interview', owner: owners[2], updated: '30 min ago', type: 'Vacancy', department: 'Digital', stage: 'Interview', due: '28 Aug 2026' },
    { id: 'candidate-maseko', name: 'Karabo Maseko', status: 'Assessment', owner: owners[1], updated: '2 hours ago', type: 'Candidate', department: 'Consulting', stage: 'Assessment', due: '15 Aug 2026' },
  ],
  leave: [
    { id: 'leave-zanele', name: 'Zanele Khumalo', status: 'Approved', owner: 'Neo Morake', updated: 'Today', type: 'Annual Leave', from: '10 Aug 2026', to: '14 Aug 2026', days: '5' },
    { id: 'leave-lethabo', name: 'Lethabo Nkosi', status: 'Awaiting Approval', owner: 'Amara Dlamini', updated: '1 hour ago', type: 'Personal Leave', from: '21 Aug 2026', to: '21 Aug 2026', days: '1' },
  ],
  knowledge: [
    { id: 'client-onboarding-playbook', name: 'Client Onboarding Playbook', status: 'Published', owner: owners[1], updated: 'Yesterday', category: 'SOP', related: 'Operations', visibility: 'Company' },
    { id: 'proposal-quality-standard', name: 'Proposal Quality Standard', status: 'Review', owner: owners[0], updated: '2 days ago', category: 'Policy', related: 'Commercial', visibility: 'Company' },
    { id: 'northstar-decisions', name: 'Northstar Decision Register', status: 'Published', owner: owners[2], updated: '3 days ago', category: 'Decision Register', related: companies[1], visibility: 'Project Team' },
  ],
  atlas: [
    { id: 'insight-margin', name: 'Margin pressure is concentrated in two delivery streams', status: 'Review', owner: 'Atlas', updated: '4 min ago', type: 'Risk', module: 'Finance', priority: 'High', confidence: '91%' },
    { id: 'insight-renewal', name: 'Three client renewals can be advanced this month', status: 'New', owner: 'Atlas', updated: '20 min ago', type: 'Opportunity', module: 'Sales', priority: 'Medium', confidence: '87%' },
    { id: 'insight-capacity', name: 'Design capacity may constrain September milestones', status: 'Acknowledged', owner: 'Atlas', updated: '1 hour ago', type: 'Observation', module: 'Projects', priority: 'High', confidence: '84%' },
  ],
  settings: [
    { id: 'company-profile', name: 'Company Profile', status: 'Configured', owner: owners[0], updated: '2 days ago', area: 'Company' },
    { id: 'module-access', name: 'Module Access', status: 'Needs Review', owner: owners[0], updated: '5 days ago', area: 'Modules' },
    { id: 'notification-policy', name: 'Notification Policy', status: 'Configured', owner: owners[1], updated: '1 week ago', area: 'Notifications' },
  ],
}
