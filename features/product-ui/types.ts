export type FieldDefinition = {
  name: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea'
  options?: readonly string[]
  required?: boolean
  section: string
  placeholder?: string
}

export type ModuleDefinition = {
  id: string
  label: string
  singular: string
  description: string
  route: string
  category: string
  primaryAction: string
  archiveLabel?: string
  views: readonly string[]
  filters: readonly string[]
  columns: readonly string[]
  tabs: readonly string[]
  fields: readonly FieldDefinition[]
  compactCreate?: boolean
}

export type MockRecord = {
  id: string
  name: string
  status: string
  owner: string
  updated: string
  [key: string]: string
}

