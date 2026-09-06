/**
 * Pure selection rules for the project form's entity pickers.
 *
 * Kept out of `queries/list-project-form-options.ts` because that module
 * carries `server-only` and so cannot be imported by a unit test — the same
 * split, for the same reason, as `overview-bands.ts`.
 */

export type SelectableMember = { userId: string; displayName: string; status: string }
export type SelectableClient = { id: string; name: string; archived_at: string | null }
export type EntityOption = { id: string; name: string }

/**
 * Active members, plus the project's current owner when that person has since
 * been removed.
 *
 * Offering only active members is correct for *choosing*. It was wrong for
 * *displaying*: an HTML `select` whose `defaultValue` matches no option falls
 * back to its first option, which here is the empty "Unassigned" one. Opening
 * Edit on a project whose owner had been offboarded therefore pre-selected
 * nothing, and saving any unrelated field — a due date, a note — wrote
 * `owner_id: null` and erased who was accountable, silently.
 *
 * The spec requires the opposite, twice: a removed member stays the owner
 * deliberately, because nulling ownership when someone leaves erases the record
 * of who was responsible. The picker offers active members; an existing owner
 * who has since been removed still displays.
 *
 * The retained owner is labelled rather than blended in, so the staleness is
 * visible instead of presenting a departed person as an ordinary choice.
 *
 * A `currentOwnerId` matching no member at all cannot normally occur —
 * `projects_owner_fkey` is a composite key into `memberships`, so the row is
 * guaranteed to exist — but it is handled by returning the active list rather
 * than inventing an option for a name we do not have.
 */
export function selectOwnerOptions(
  members: ReadonlyArray<SelectableMember>,
  currentOwnerId?: string | null,
): EntityOption[] {
  const active = members
    .filter((member) => member.status === 'active')
    .map((member) => ({ id: member.userId, name: member.displayName }))

  if (!currentOwnerId || active.some((option) => option.id === currentOwnerId)) return active

  const retained = members.find((member) => member.userId === currentOwnerId)
  if (!retained) return active

  return [...active, { id: retained.userId, name: `${retained.displayName} (removed)` }]
}

/**
 * Unarchived clients, plus the project's current client when it has since been
 * archived. Identical reasoning to `selectOwnerOptions`: `clientId` is optional,
 * so a missing option meant an edit silently wrote `client_id: null` rather
 * than refusing.
 */
export function selectClientOptions(
  clients: ReadonlyArray<SelectableClient>,
  currentClientId?: string | null,
): EntityOption[] {
  const open = clients
    .filter((client) => client.archived_at === null)
    .map((client) => ({ id: client.id, name: client.name }))

  if (!currentClientId || open.some((option) => option.id === currentClientId)) return open

  const retained = clients.find((client) => client.id === currentClientId)
  if (!retained) return open

  return [...open, { id: retained.id, name: `${retained.name} (archived)` }]
}

export type SelectableFramework = { id: string; name: string; archived_at: string | null }

/**
 * Unarchived frameworks, plus the project's current framework when it has
 * since been archived. Identical reasoning to selectClientOptions:
 * `frameworkId` is required and rendered as a controlled `<select>` in
 * ProjectForm, so a missing option does not fall back to an empty choice —
 * `selectedIndex` becomes -1, the field renders blank, and a `required`
 * select with nothing selected refuses to submit. Editing any other field on
 * the project became impossible, and the only escape (choosing a different
 * framework) re-filtered the phase list and silently nulled phase_id too.
 */
export function selectFrameworkOptions(
  frameworks: ReadonlyArray<SelectableFramework>,
  currentFrameworkId?: string | null,
): EntityOption[] {
  const open = frameworks
    .filter((framework) => framework.archived_at === null)
    .map((framework) => ({ id: framework.id, name: framework.name }))

  if (!currentFrameworkId || open.some((option) => option.id === currentFrameworkId)) return open

  const retained = frameworks.find((framework) => framework.id === currentFrameworkId)
  if (!retained) return open

  return [...open, { id: retained.id, name: `${retained.name} (archived)` }]
}

export type SelectablePhase = { id: string; name: string; frameworkId: string; archived_at: string | null }
export type PhaseOption = { id: string; name: string; frameworkId: string }

/**
 * Unarchived phases, plus the project's current phase when it has since been
 * archived. Identical reasoning to selectOwnerOptions: `phaseId` is optional,
 * so a missing option means the next unrelated edit silently writes
 * phase_id: null over a recorded governance fact.
 *
 * Keeps `frameworkId` because ProjectForm filters the list client-side when the
 * framework changes; an option without it would vanish from the picker.
 */
export function selectPhaseOptions(
  phases: ReadonlyArray<SelectablePhase>,
  currentPhaseId?: string | null,
): PhaseOption[] {
  const open = phases
    .filter((phase) => phase.archived_at === null)
    .map((phase) => ({ id: phase.id, name: phase.name, frameworkId: phase.frameworkId }))

  if (!currentPhaseId || open.some((option) => option.id === currentPhaseId)) return open

  const retained = phases.find((phase) => phase.id === currentPhaseId)
  if (!retained) return open

  return [...open, { id: retained.id, name: `${retained.name} (archived)`, frameworkId: retained.frameworkId }]
}
