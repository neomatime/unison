import type { ActionState } from '../types'

export const input = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'
export const area = `${input} min-h-20 py-2`

export function Feedback({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm text-success">{state.success}</p>
  return null
}
