// What a client file is, in the words people use about a client. The stored values are fixed by a database check
// (documents.classification / documents.confidentiality) and by the data export, so only the labels read differently.
// Pure: no imports.

export const FILE_TYPES = [
  { value: 'Project Evidence', label: 'Proof of work delivered to the client' },
  { value: 'Requirements', label: 'What the client asked for (briefs and requirements)' },
  { value: 'Compliance', label: 'Client compliance and onboarding checks' },
  { value: 'Design Artefact', label: 'Designs and drafts shared with the client' },
  { value: 'Commercial', label: 'Quotes, contracts and agreements with the client' },
  { value: 'Other', label: 'Other client files' },
] as const

export const FILE_VISIBILITY = [
  { value: 'Internal', label: 'Internal: our team only' },
  { value: 'Confidential', label: 'Confidential: sensitive client information' },
  { value: 'Restricted', label: 'Restricted: highly sensitive, handle with care' },
] as const

const label = (list: ReadonlyArray<{ value: string; label: string }>, value: string) => list.find((item) => item.value === value)?.label ?? value
export const fileTypeLabel = (value: string) => label(FILE_TYPES, value)
export const fileVisibilityLabel = (value: string) => label(FILE_VISIBILITY, value)
