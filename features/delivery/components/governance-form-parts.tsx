import type { GovernanceActionState } from "../actions/project-governance";

// Shared by the Governance registers. A plain module with no directive: it holds
// no state and is imported by client components only.
export const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand";
export const area = `${input} min-h-24 py-2`;

/** Formats a YYYY-MM-DD date-only string without a timezone shift. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA");
}

export function Feedback({ state }: { state: GovernanceActionState | undefined }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : state?.success ? (
    <p role="status" className="text-sm text-success">
      {state.success}
    </p>
  ) : null;
}
