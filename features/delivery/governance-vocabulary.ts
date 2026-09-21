// The risk vocabularies, stated once for both the server actions and the client
// form. Plain constants with no directive, so either side can import them (a
// 'use server' file cannot export non-function values across the boundary).
// tests/unit/governance-vocabulary.test.ts reads the project_risks check
// constraints out of the migration and fails if these drift from them.

/** Matches project_risks_probability_check. */
export const RISK_PROBABILITIES = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'] as const

/** Matches project_risks_impact_check. */
export const RISK_IMPACTS = ['Minor', 'Moderate', 'Major', 'Severe'] as const

/** Matches project_risks_status_check. */
export const RISK_STATUSES = ['Open', 'Mitigating', 'Accepted', 'Closed'] as const

/** Matches approvals_priority_check. */
export const APPROVAL_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
