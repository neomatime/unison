// Pure readers for the Governance forms, so the validation the server actions
// depend on is unit testable. Relative imports only: Node's test runner cannot
// resolve the '@/' alias, and 'use server' modules cannot be imported by a test.
import { isUuid } from '../../lib/utils/index.ts'
import { APPROVAL_PRIORITIES, RISK_IMPACTS, RISK_PROBABILITIES, RISK_STATUSES } from './governance-vocabulary.ts'
import { isValidIsoDate } from './schemas/date.ts'
import { isHttpsUrl } from './schemas/url.ts'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || null
const isOneOf = (options: readonly string[], candidate: string) => options.includes(candidate)

export type RiskFields = {
  title: string
  description: string | null
  probability: string
  impact: string
  status: string
  owner_id: string | null
  mitigation: string | null
  target_date: string | null
}

export function readRiskFields(form: FormData): RiskFields | { error: string } {
  const title = value(form, 'title')
  if (!title) return { error: 'A risk title is required.' }

  // No defaults: a missing select is a malformed request, not "Possible".
  const probability = value(form, 'probability')
  if (!isOneOf(RISK_PROBABILITIES, probability)) return { error: 'Choose a valid probability.' }
  const impact = value(form, 'impact')
  if (!isOneOf(RISK_IMPACTS, impact)) return { error: 'Choose a valid impact.' }
  const status = value(form, 'status')
  if (!isOneOf(RISK_STATUSES, status)) return { error: 'Choose a valid status.' }

  const ownerId = optional(form, 'ownerId')
  if (ownerId && !isUuid(ownerId)) return { error: 'Choose a valid owner.' }

  const targetDate = optional(form, 'targetDate')
  if (targetDate && !isValidIsoDate(targetDate)) return { error: 'Enter a valid target date.' }

  return {
    title,
    description: optional(form, 'description'),
    probability,
    impact,
    status,
    owner_id: ownerId,
    mitigation: optional(form, 'mitigation'),
    target_date: targetDate,
  }
}

export type ArtefactFields = { name: string; external_url: string; notes: string | null }

export function readArtefactFields(form: FormData): ArtefactFields | { error: string } {
  const name = value(form, 'name')
  const externalUrl = value(form, 'externalUrl')
  if (!name || !externalUrl) return { error: 'An artefact name and secure URL are required.' }
  if (!isHttpsUrl(externalUrl)) return { error: 'Use a valid HTTPS evidence URL.' }
  return { name, external_url: externalUrl, notes: optional(form, 'notes') }
}

export type DecisionFields = { title: string; decision: string; rationale: string | null; decided_at: string | null }

export function readDecisionFields(form: FormData): DecisionFields | { error: string } {
  const title = value(form, 'title')
  if (!title) return { error: 'A decision title is required.' }
  const decision = value(form, 'decision')
  if (!decision) return { error: 'The decision text is required.' }

  const decidedAt = optional(form, 'decidedAt')
  if (decidedAt && !isValidIsoDate(decidedAt)) return { error: 'Enter a valid decision date.' }

  return { title, decision, rationale: optional(form, 'rationale'), decided_at: decidedAt }
}

export type ApprovalFields = { title: string; description: string | null; priority: string; due_date: string | null }

export function readApprovalFields(form: FormData): ApprovalFields | { error: string } {
  const title = value(form, 'title')
  if (!title) return { error: 'An approval title is required.' }

  // No default: a missing priority is a malformed request, not "Medium".
  const priority = value(form, 'priority')
  if (!isOneOf(APPROVAL_PRIORITIES, priority)) return { error: 'Choose a valid priority.' }

  const dueDate = optional(form, 'dueDate')
  if (dueDate && !isValidIsoDate(dueDate)) return { error: 'Enter a valid due date.' }

  return { title, description: optional(form, 'description'), priority, due_date: dueDate }
}

export type GateFields = { name: string; description: string | null; approval_required: boolean; evidence_required: boolean }

export function readGateFields(form: FormData): GateFields | { error: string } {
  const name = value(form, 'name')
  if (!name) return { error: 'A gate name is required.' }
  return {
    name,
    description: optional(form, 'description'),
    approval_required: form.get('approvalRequired') === 'on',
    evidence_required: form.get('evidenceRequired') === 'on',
  }
}
