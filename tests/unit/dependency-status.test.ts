import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveDependencyStatus, type DependencyRequirement, type PrerequisiteState } from '../../features/delivery/dependency-status.ts'

const TODAY = '2026-09-06'

function requirement(over: Partial<DependencyRequirement> = {}): DependencyRequirement {
  return { requiredStatus: 'Complete', requiredPhaseName: null, requiredPhasePosition: null, requiredByDate: null, ...over }
}

function prerequisite(over: Partial<PrerequisiteState> = {}): PrerequisiteState {
  return { name: 'Customer Data Migration', status: 'Active', health: 'Healthy', archived: false, currentPhasePosition: null, ...over }
}

test('a status requirement is satisfied on an exact match', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'Complete' }), TODAY)
  assert.equal(result.status, 'Satisfied')
})

test('a status requirement is not satisfied by a different status', () => {
  // Project status is a lifecycle vocabulary, not an ordered progression, so
  // there is no ">=" reading. On Hold is not "past" Complete.
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'On Hold' }), TODAY)
  assert.equal(result.status, 'Pending')
})

test('a phase requirement is satisfied once the prerequisite has PASSED it', () => {
  // "Reached" means reached or passed. A project in Deploy has evidently
  // passed Build; requiring it to sit exactly on Build would make the
  // dependency un-satisfiable the moment the prerequisite moved on.
  const result = deriveDependencyStatus(
    requirement({ requiredStatus: null, requiredPhaseName: 'Build', requiredPhasePosition: 4 }),
    prerequisite({ currentPhasePosition: 7 }),
    TODAY,
  )
  assert.equal(result.status, 'Satisfied')
})

test('a phase requirement is satisfied when sitting exactly on the phase', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredStatus: null, requiredPhaseName: 'Build', requiredPhasePosition: 4 }),
    prerequisite({ currentPhasePosition: 4 }),
    TODAY,
  )
  assert.equal(result.status, 'Satisfied')
})

test('a prerequisite with no phase recorded is not satisfied', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredStatus: null, requiredPhaseName: 'Build', requiredPhasePosition: 4 }),
    prerequisite({ currentPhasePosition: null }),
    TODAY,
  )
  assert.equal(result.status, 'Pending')
})

test('an unmet requirement past its required-by date is Blocked', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-09-01' }),
    prerequisite({ status: 'Active' }),
    TODAY,
  )
  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /Customer Data Migration/)
})

test('a cancelled prerequisite is Blocked even with no date at all', () => {
  // The case that proves cancellation is independent of the date. A dependency
  // waiting on a cancelled project must not sit as Pending until some date
  // happens to lapse -- it is the clearest possible blockage.
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'Cancelled' }), TODAY)

  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /cancelled/i)
})

test('an archived prerequisite is Blocked even with no date at all', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ archived: true }), TODAY)

  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /archived/i)
})

test('a cancelled prerequisite is Blocked even when its date is still in the near future', () => {
  // The case that pins the precedence. With the date checks running first this
  // would read At Risk, which understates a prerequisite that can never arrive.
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-09-20' }),
    prerequisite({ status: 'Cancelled' }),
    TODAY,
  )
  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /cancelled/i)
})

test('an archived prerequisite is Blocked even when its date is still in the near future', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-09-20' }),
    prerequisite({ archived: true }),
    TODAY,
  )
  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /archived/i)
})

test('a satisfied requirement stays Satisfied even when the date has passed', () => {
  // Lateness cannot un-satisfy a met requirement.
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-01-01' }),
    prerequisite({ status: 'Complete' }),
    TODAY,
  )
  assert.equal(result.status, 'Satisfied')
})

test('an unmet requirement due inside 30 days is At Risk', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-09-20' }),
    prerequisite({ status: 'Active' }),
    TODAY,
  )
  assert.equal(result.status, 'At Risk')
})

test('a dependency due today reads "is required today", not "within 0 days"', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: TODAY }),
    prerequisite({ status: 'Active' }),
    TODAY,
  )
  assert.equal(result.status, 'At Risk')
  assert.equal(result.reason, 'Customer Data Migration has not reached Complete, and is required today.')
})

test('a dependency due tomorrow reads "within 1 day", not "within 1 days"', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-09-07' }),
    prerequisite({ status: 'Active' }),
    TODAY,
  )
  assert.equal(result.status, 'At Risk')
  assert.equal(result.reason, 'Customer Data Migration has not reached Complete, and is required within 1 day.')
})

test('an unmet requirement on an At Risk prerequisite is At Risk with no date', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ health: 'At Risk' }), TODAY)
  assert.equal(result.status, 'At Risk')
})

test('an unmet requirement on a Critical prerequisite is At Risk with no date', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ health: 'Critical' }), TODAY)
  assert.equal(result.status, 'At Risk')
})

test('an unmet requirement with a distant date and a healthy prerequisite is Pending', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2027-06-01' }),
    prerequisite({ status: 'Active', health: 'Healthy' }),
    TODAY,
  )
  assert.equal(result.status, 'Pending')
})

test('Blocked beats At Risk', () => {
  // A past date and a Critical prerequisite together must not read as merely
  // At Risk -- the more severe reading wins.
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-08-01' }),
    prerequisite({ health: 'Critical' }),
    TODAY,
  )
  assert.equal(result.status, 'Blocked')
})

test('every non-satisfied status names the prerequisite and what it has not reached', () => {
  // Requirement §3: the reason for a non-satisfied state must be visible. A
  // badge without its reason is what that section explicitly refuses.
  for (const state of [
    prerequisite({ status: 'Active' }),
    prerequisite({ status: 'Cancelled' }),
    prerequisite({ archived: true }),
    prerequisite({ health: 'Critical' }),
  ]) {
    const result = deriveDependencyStatus(requirement({ requiredByDate: '2026-09-10' }), state, TODAY)
    assert.notEqual(result.status, 'Satisfied')
    assert.match(result.reason, /Customer Data Migration/, 'the reason must name the prerequisite')
    assert.ok(result.reason.length > 0)
  }
})

test('a satisfied dependency still explains itself', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'Complete' }), TODAY)
  assert.match(result.reason, /Customer Data Migration/)
})
