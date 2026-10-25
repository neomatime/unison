import { ArrowRight, CircleCheck, CircleX } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'

import { fieldClasses } from '@/components/ui/form-fields'
import { DECLINE_REASONS, type DecisionKind } from '@/lib/quote-portal/types'
import { cn } from '@/lib/utils'
import { ACCEPT_QUOTATION, CONFIRMATION_LABELS, DECLINE_QUOTATION, FLOW_BUTTONS, FORM_LABELS, STEP_LABELS } from '../copy'
import { consentTextFor, type FlowField, type FlowState, type FlowText } from '../decision-flow'
import type { ConfirmationModel } from '../portal-view-model'

// The steps of the decision flow, laid out. They hold no state and call nothing: PortalDecisionFlow gives them the
// flow's state and what to do on each press, and owns the focus. Every control is a real button of type "button" and
// there is no form, so nothing can be submitted before the page has loaded, and nothing typed ever reaches an address.
// Everything printed is a React text node.

const MUTED = 'text-[var(--briefing-muted)]'
const WRAP = '[overflow-wrap:anywhere]'
const BUTTON = 'flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY = cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')
const OUTLINE = cn(BUTTON, 'border border-foreground text-foreground hover:bg-accent')
const DANGER = cn(BUTTON, 'border border-danger text-danger hover:bg-danger-soft')
const LABEL = 'text-sm font-medium text-foreground'
const HEADING = 'font-brand text-base font-medium leading-tight text-foreground outline-none'

/** The id of a field's control, and of its error. */
export const fieldId = (idBase: string, field: FlowField) => `${idBase}-${field}`
const errorId = (idBase: string, field: FlowField) => `${fieldId(idBase, field)}-error`

/** The ARIA of a control: invalid and described by its error when it has one, nothing otherwise. */
function invalidity(idBase: string, field: FlowField, error: string | undefined) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': errorId(idBase, field) } : {}
}

function FieldError({ idBase, field, error }: { idBase: string; field: FlowField; error: string | undefined }) {
  return error ? (
    <p id={errorId(idBase, field)} className="mt-1.5 text-sm text-danger">
      {error}
    </p>
  ) : null
}

export function IdleStep({
  acceptRef,
  declineRef,
  onOpen,
}: {
  acceptRef: RefObject<HTMLButtonElement | null>
  declineRef: RefObject<HTMLButtonElement | null>
  onOpen: (decision: DecisionKind) => void
}) {
  return (
    <div className="space-y-3">
      <button ref={acceptRef} type="button" onClick={() => onOpen('accepted')} className={PRIMARY}>
        <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 text-left">{ACCEPT_QUOTATION}</span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
      </button>
      <button ref={declineRef} type="button" onClick={() => onOpen('declined')} className={DANGER}>
        <CircleX aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 text-left">{DECLINE_QUOTATION}</span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
      </button>
    </div>
  )
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={WRAP}>
      <dt className={cn('text-[11px] uppercase tracking-[0.14em]', MUTED)}>{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  )
}

function TextField({
  idBase,
  field,
  label,
  value,
  error,
  autoComplete,
  readOnly,
  onChange,
}: {
  idBase: string
  field: 'name' | 'position' | 'organisation'
  label: string
  value: string
  error: string | undefined
  autoComplete: string
  readOnly: boolean
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={fieldId(idBase, field)} className={LABEL}>
        {label}
      </label>
      <input
        id={fieldId(idBase, field)}
        type="text"
        value={value}
        autoComplete={autoComplete}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClasses}
        {...invalidity(idBase, field, error)}
      />
      <FieldError idBase={idBase} field={field} error={error} />
    </div>
  )
}

export function ConfirmStep({
  state,
  confirmation,
  verifiedEmail,
  idBase,
  headingRef,
  onEdit,
  onConsent,
  onRequestCode,
  onBack,
}: {
  state: FlowState
  confirmation: ConfirmationModel
  verifiedEmail: string
  idBase: string
  headingRef: RefObject<HTMLHeadingElement | null>
  onEdit: (field: FlowText, value: string) => void
  onConsent: (checked: boolean) => void
  onRequestCode: (trigger: HTMLElement) => void
  onBack: () => void
}) {
  const { errors } = state
  const declining = state.decision === 'declined'
  const busy = state.pending !== null
  return (
    <div>
      <h3 ref={headingRef} tabIndex={-1} className={HEADING}>
        {declining ? STEP_LABELS.confirmDecline : STEP_LABELS.confirmAccept}
      </h3>

      <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
        <SummaryItem label={CONFIRMATION_LABELS.quotation}>{confirmation.numberAndVersion}</SummaryItem>
        {confirmation.organisation ? <SummaryItem label={CONFIRMATION_LABELS.organisation}>{confirmation.organisation}</SummaryItem> : null}
        {confirmation.services.length ? (
          <SummaryItem label={CONFIRMATION_LABELS.services}>
            <ul className="list-disc space-y-0.5 pl-5 font-normal">
              {confirmation.services.map((service, index) => (
                <li key={index}>{service}</li>
              ))}
            </ul>
          </SummaryItem>
        ) : null}
        <SummaryItem label={CONFIRMATION_LABELS.initialTotal}>{confirmation.initialTotal}</SummaryItem>
        {confirmation.recurring ? <SummaryItem label={CONFIRMATION_LABELS.recurring}>{confirmation.recurring}</SummaryItem> : null}
        {confirmation.keyTerms.length ? (
          <SummaryItem label={CONFIRMATION_LABELS.keyTerms}>
            <ol className="list-decimal space-y-0.5 pl-5 font-normal leading-relaxed">
              {confirmation.keyTerms.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ol>
          </SummaryItem>
        ) : null}
      </dl>

      <div className="mt-5 space-y-4 border-t border-border pt-5">
        <TextField idBase={idBase} field="name" label={FORM_LABELS.name} value={state.name} error={errors.name} autoComplete="name" readOnly={busy} onChange={(value) => onEdit('name', value)} />
        <TextField idBase={idBase} field="position" label={FORM_LABELS.position} value={state.position} error={errors.position} autoComplete="organization-title" readOnly={busy} onChange={(value) => onEdit('position', value)} />
        <TextField idBase={idBase} field="organisation" label={FORM_LABELS.organisation} value={state.organisation} error={errors.organisation} autoComplete="organization" readOnly={busy} onChange={(value) => onEdit('organisation', value)} />

        {/* Where the code goes: the link's own recipient, shown and never typed. */}
        <dl className={cn('text-sm', WRAP)}>
          <dt className={LABEL}>{FORM_LABELS.email}</dt>
          <dd className="mt-1.5 text-foreground/85">{verifiedEmail}</dd>
        </dl>

        {declining ? (
          <>
            <div>
              <label htmlFor={fieldId(idBase, 'reason')} className={LABEL}>
                {FORM_LABELS.reason}
              </label>
              <select
                id={fieldId(idBase, 'reason')}
                value={state.declineReason}
                disabled={busy}
                onChange={(event) => onEdit('declineReason', event.target.value)}
                className={cn(fieldClasses, 'cursor-pointer')}
                {...invalidity(idBase, 'reason', errors.reason)}
              >
                <option value="">{FORM_LABELS.noReason}</option>
                {DECLINE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              <FieldError idBase={idBase} field="reason" error={errors.reason} />
            </div>
            <div>
              <label htmlFor={fieldId(idBase, 'comments')} className={LABEL}>
                {FORM_LABELS.comments}
              </label>
              <textarea
                id={fieldId(idBase, 'comments')}
                rows={4}
                value={state.declineComments}
                readOnly={busy}
                onChange={(event) => onEdit('declineComments', event.target.value)}
                className={cn(fieldClasses, 'py-3')}
                {...invalidity(idBase, 'comments', errors.comments)}
              />
              <FieldError idBase={idBase} field="comments" error={errors.comments} />
            </div>
          </>
        ) : null}

        <div>
          <div className="flex items-start gap-3">
            <input
              id={fieldId(idBase, 'consent')}
              type="checkbox"
              checked={state.consent}
              disabled={busy}
              onChange={(event) => onConsent(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
              {...invalidity(idBase, 'consent', errors.consent)}
            />
            <label htmlFor={fieldId(idBase, 'consent')} className="text-sm leading-relaxed text-foreground">
              {state.decision ? consentTextFor(state.decision) : null}
            </label>
          </div>
          <FieldError idBase={idBase} field="consent" error={errors.consent} />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <button type="button" disabled={busy} onClick={(event) => onRequestCode(event.currentTarget)} className={PRIMARY}>
          {state.pending === 'code' ? FLOW_BUTTONS.sending : FLOW_BUTTONS.emailCode}
        </button>
        <button type="button" disabled={busy} onClick={onBack} className={OUTLINE}>
          {FLOW_BUTTONS.back}
        </button>
      </div>
    </div>
  )
}

export function CodeStep({
  state,
  idBase,
  headingRef,
  newCodeRef,
  onEdit,
  onConfirm,
  onRequestCode,
  onBack,
}: {
  state: FlowState
  idBase: string
  headingRef: RefObject<HTMLHeadingElement | null>
  /** On "Send a new code", which takes focus when a code is spent (Confirm is disabled by then). */
  newCodeRef: RefObject<HTMLButtonElement | null>
  onEdit: (field: FlowText, value: string) => void
  onConfirm: (trigger: HTMLElement) => void
  onRequestCode: (trigger: HTMLElement) => void
  onBack: () => void
}) {
  const busy = state.pending !== null
  return (
    <div>
      <h3 ref={headingRef} tabIndex={-1} className={HEADING}>
        {STEP_LABELS.code}
      </h3>
      <div className="mt-4">
        <label htmlFor={fieldId(idBase, 'code')} className={LABEL}>
          {FORM_LABELS.code}
        </label>
        <input
          id={fieldId(idBase, 'code')}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          spellCheck={false}
          value={state.code}
          readOnly={busy}
          onChange={(event) => onEdit('code', event.target.value)}
          onKeyDown={(event) => {
            // Enter confirms, as it would in a form; there is no form, so nothing is ever submitted to an address.
            if (event.key === 'Enter') {
              event.preventDefault()
              onConfirm(event.currentTarget)
            }
          }}
          className={cn(fieldClasses, 'text-base tracking-[0.3em] tabular-nums')}
          {...invalidity(idBase, 'code', state.errors.code)}
        />
        <FieldError idBase={idBase} field="code" error={state.errors.code} />
      </div>
      <div className="mt-5 space-y-3">
        <button type="button" disabled={busy || state.needsNewCode} onClick={(event) => onConfirm(event.currentTarget)} className={PRIMARY}>
          {state.pending === 'decision' ? FLOW_BUTTONS.confirming : FLOW_BUTTONS.confirm}
        </button>
        <button ref={newCodeRef} type="button" disabled={busy} onClick={(event) => onRequestCode(event.currentTarget)} className={OUTLINE}>
          {state.pending === 'code' ? FLOW_BUTTONS.sending : FLOW_BUTTONS.newCode}
        </button>
        <button type="button" disabled={busy} onClick={onBack} className={cn(BUTTON, 'text-foreground underline-offset-2 hover:underline')}>
          {FLOW_BUTTONS.back}
        </button>
      </div>
    </div>
  )
}
