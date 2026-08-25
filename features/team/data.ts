export type MemberStatus = 'Active' | 'Inactive' | 'Invited'
export type AvailabilityStatus = 'Available' | 'Partial' | 'Busy' | 'Unavailable'

export type TeamMember = {
  id: string
  name: string
  email: string
  title: string
  role: string
  department: string
  team: string
  manager: string
  projects: number
  projectNames: string[]
  capacity: number
  availability: AvailabilityStatus
  availabilityNote: string
  status: MemberStatus
  accessRole: string
  joined: string
}

export const teamMembers: TeamMember[] = [
  { id: 'neo-morake', name: 'Neo Morake', email: 'neo@himark.co.za', title: 'Chief Executive Officer', role: 'Executive Sponsor', department: 'Executive', team: 'Leadership', manager: 'HIMARK Board', projects: 3, projectNames: ['Claims Automation', 'Client Onboarding', 'Policy Modernisation'], capacity: 85, availability: 'Busy', availabilityNote: 'Executive commitments', status: 'Active', accessRole: 'Owner', joined: '01 Jan 2023' },
  { id: 'amara-dlamini', name: 'Amara Dlamini', email: 'amara@himark.co.za', title: 'Strategy Director', role: 'Delivery Manager', department: 'Delivery', team: 'Business Solutions', manager: 'Neo Morake', projects: 3, projectNames: ['Claims Automation', 'Growth Programme', 'Operating Model'], capacity: 85, availability: 'Busy', availabilityNote: 'Fully allocated this week', status: 'Active', accessRole: 'Admin', joined: '12 Feb 2024' },
  { id: 'lethabo-nkosi', name: 'Lethabo Nkosi', email: 'lethabo@himark.co.za', title: 'Product Lead', role: 'Product Owner', department: 'Delivery', team: 'Platform Engineering', manager: 'Amara Dlamini', projects: 2, projectNames: ['Policy Modernisation', 'Document Hub'], capacity: 70, availability: 'Available', availabilityNote: '30% delivery capacity available', status: 'Active', accessRole: 'Member', joined: '06 May 2025' },
  { id: 'zanele-khumalo', name: 'Zanele Khumalo', email: 'zanele@himark.co.za', title: 'Finance Manager', role: 'Business Owner', department: 'Finance', team: 'Operations', manager: 'Neo Morake', projects: 2, projectNames: ['Finance Controls', 'Vendor Review'], capacity: 95, availability: 'Busy', availabilityNote: 'Near capacity', status: 'Active', accessRole: 'Member', joined: '18 Sep 2023' },
  { id: 'thabo-mokoena', name: 'Thabo Mokoena', email: 'thabo@himark.co.za', title: 'Project Lead', role: 'Project Manager', department: 'Delivery', team: 'Integration Services', manager: 'Amara Dlamini', projects: 2, projectNames: ['Claims Automation', 'Vendor Integration'], capacity: 90, availability: 'Partial', availabilityNote: 'Available Friday', status: 'Active', accessRole: 'Member', joined: '04 Mar 2024' },
  { id: 'naledi-maseko', name: 'Naledi Maseko', email: 'naledi@himark.co.za', title: 'Business Analyst', role: 'Business Analyst', department: 'Delivery', team: 'Business Solutions', manager: 'Amara Dlamini', projects: 2, projectNames: ['Claims Automation', 'Client Onboarding'], capacity: 75, availability: 'Available', availabilityNote: 'Available for new work', status: 'Active', accessRole: 'Member', joined: '19 Jun 2025' },
  { id: 'mia-daniels', name: 'Mia Daniels', email: 'mia@himark.co.za', title: 'Test Lead', role: 'Test Lead', department: 'Delivery', team: 'Quality Assurance', manager: 'Lethabo Nkosi', projects: 2, projectNames: ['Claims Automation', 'Policy Validation'], capacity: 100, availability: 'Unavailable', availabilityNote: 'Test execution commitment', status: 'Active', accessRole: 'Member', joined: '22 Jan 2025' },
  { id: 'sibusiso-molefe', name: 'Sibusiso Molefe', email: 'sibusiso@himark.co.za', title: 'Solutions Architect', role: 'Solution Architect', department: 'Delivery', team: 'Platform Engineering', manager: 'Lethabo Nkosi', projects: 1, projectNames: ['Document Hub'], capacity: 60, availability: 'Available', availabilityNote: '40% delivery capacity available', status: 'Active', accessRole: 'Member', joined: '14 Apr 2025' },
  { id: 'karabo-maseko', name: 'Karabo Maseko', email: 'karabo@himark.co.za', title: 'Change Lead', role: 'Change Lead', department: 'Operations', team: 'Client Operations', manager: 'Amara Dlamini', projects: 1, projectNames: ['Client Onboarding'], capacity: 65, availability: 'Partial', availabilityNote: 'Planned time away on Thursday', status: 'Active', accessRole: 'Member', joined: '03 Aug 2025' },
  { id: 'olivia-grant', name: 'Olivia Grant', email: 'olivia@himark.co.za', title: 'Business Analyst', role: 'Business Analyst', department: 'Commercial', team: 'Sales Engineering', manager: 'Neo Morake', projects: 0, projectNames: [], capacity: 0, availability: 'Available', availabilityNote: 'Invitation pending', status: 'Invited', accessRole: 'Member', joined: 'Invited 24 Aug 2026' },
]

export const departments = [
  { id: 'delivery', name: 'Delivery', lead: 'Amara Dlamini', members: '28', teams: '4', projects: '12', capacity: '82%', status: 'Active' },
  { id: 'operations', name: 'Operations', lead: 'Karabo Maseko', members: '8', teams: '2', projects: '4', capacity: '68%', status: 'Active' },
  { id: 'commercial', name: 'Commercial', lead: 'Neo Morake', members: '6', teams: '1', projects: '3', capacity: '71%', status: 'Active' },
  { id: 'finance', name: 'Finance', lead: 'Zanele Khumalo', members: '4', teams: '1', projects: '2', capacity: '76%', status: 'Active' },
  { id: 'executive', name: 'Executive', lead: 'Neo Morake', members: '2', teams: '1', projects: '6', capacity: '85%', status: 'Active' },
]

export const deliveryTeams = [
  { id: 'business-solutions', name: 'Business Solutions', lead: 'Amara Dlamini', department: 'Delivery', members: '8', projects: '5', capacity: '84%', availability: 'Partial', status: 'Active' },
  { id: 'platform-engineering', name: 'Platform Engineering', lead: 'Lethabo Nkosi', department: 'Delivery', members: '7', projects: '4', capacity: '78%', availability: 'Available', status: 'Active' },
  { id: 'integration-services', name: 'Integration Services', lead: 'Thabo Mokoena', department: 'Delivery', members: '6', projects: '3', capacity: '92%', availability: 'Busy', status: 'Active' },
  { id: 'quality-assurance', name: 'Quality Assurance', lead: 'Mia Daniels', department: 'Delivery', members: '5', projects: '4', capacity: '88%', availability: 'Busy', status: 'Active' },
  { id: 'client-operations', name: 'Client Operations', lead: 'Karabo Maseko', department: 'Operations', members: '8', projects: '4', capacity: '68%', availability: 'Available', status: 'Active' },
]

export const deliveryRoles = [
  { id: 'delivery-manager', name: 'Delivery Manager', category: 'Delivery Leadership', members: '3', frameworks: '6', projects: '9', status: 'Active' },
  { id: 'project-manager', name: 'Project Manager', category: 'Project Delivery', members: '7', frameworks: '5', projects: '12', status: 'Active' },
  { id: 'business-analyst', name: 'Business Analyst', category: 'Analysis', members: '8', frameworks: '6', projects: '10', status: 'Active' },
  { id: 'product-owner', name: 'Product Owner', category: 'Product', members: '4', frameworks: '3', projects: '5', status: 'Active' },
  { id: 'solution-architect', name: 'Solution Architect', category: 'Architecture', members: '3', frameworks: '5', projects: '7', status: 'Active' },
  { id: 'technical-lead', name: 'Technical Lead', category: 'Technology', members: '5', frameworks: '4', projects: '8', status: 'Active' },
  { id: 'test-lead', name: 'Test Lead', category: 'Quality', members: '3', frameworks: '6', projects: '6', status: 'Active' },
  { id: 'change-lead', name: 'Change Lead', category: 'Change', members: '2', frameworks: '4', projects: '4', status: 'Active' },
]

export const projectAssignments = [
  { id: 'assign-1', memberId: 'amara-dlamini', member: 'Amara Dlamini', project: 'Claims Automation', role: 'Delivery Manager', team: 'Business Solutions', allocation: 40, start: '01 Jul 2026', end: '30 Nov 2026', status: 'Active' },
  { id: 'assign-2', memberId: 'lethabo-nkosi', member: 'Lethabo Nkosi', project: 'Policy Modernisation', role: 'Product Owner', team: 'Platform Engineering', allocation: 45, start: '15 Jul 2026', end: '15 Dec 2026', status: 'Active' },
  { id: 'assign-3', memberId: 'thabo-mokoena', member: 'Thabo Mokoena', project: 'Vendor Integration', role: 'Project Manager', team: 'Integration Services', allocation: 60, start: '01 Aug 2026', end: '31 Jan 2027', status: 'Active' },
  { id: 'assign-4', memberId: 'naledi-maseko', member: 'Naledi Maseko', project: 'Client Onboarding', role: 'Business Analyst', team: 'Business Solutions', allocation: 50, start: '10 Aug 2026', end: '30 Oct 2026', status: 'Active' },
  { id: 'assign-5', memberId: 'mia-daniels', member: 'Mia Daniels', project: 'Claims Automation', role: 'Test Lead', team: 'Quality Assurance', allocation: 70, start: '20 Jul 2026', end: '20 Sep 2026', status: 'Active' },
  { id: 'assign-6', memberId: 'sibusiso-molefe', member: 'Sibusiso Molefe', project: 'Document Hub', role: 'Solution Architect', team: 'Platform Engineering', allocation: 60, start: '01 Aug 2026', end: '30 Nov 2026', status: 'Active' },
]

export const teamActivity = [
  { id: 'activity-1', member: 'James Carter', action: 'Updated delivery role', module: 'Team', record: 'Business Analyst', date: 'Today, 09:42', status: 'Success' },
  { id: 'activity-2', member: 'Amara Dlamini', action: 'Approved governance gate', module: 'Projects', record: 'Claims Automation', date: 'Today, 08:15', status: 'Success' },
  { id: 'activity-3', member: 'Mia Daniels', action: 'Uploaded test evidence', module: 'Projects', record: 'UAT Execution Report', date: 'Yesterday, 16:34', status: 'Success' },
  { id: 'activity-4', member: 'Thabo Mokoena', action: 'Assigned team member', module: 'Team', record: 'Vendor Integration', date: 'Yesterday, 14:20', status: 'Success' },
  { id: 'activity-5', member: 'Lethabo Nkosi', action: 'Updated capacity', module: 'Team', record: 'Platform Engineering', date: 'Yesterday, 11:08', status: 'Reviewed' },
  { id: 'activity-6', member: 'Neo Morake', action: 'Created framework version', module: 'Frameworks', record: 'Business Change v3.2', date: '22 Aug, 15:12', status: 'Success' },
  { id: 'activity-7', member: 'Zanele Khumalo', action: 'Archived vendor', module: 'Vendors', record: 'Legacy Integration Services', date: '22 Aug, 10:05', status: 'Archived' },
]
