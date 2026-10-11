// Turns a database error into the state a form shows. No directive and no imports of server code.
import { documentErrorMessage } from './errors.ts'
import type { ActionState } from './types.ts'

export function failureState(error: { message?: string } | null, fallback = 'The document could not be completed. Please try again.'): ActionState {
  return { error: documentErrorMessage(error?.message) ?? fallback }
}
