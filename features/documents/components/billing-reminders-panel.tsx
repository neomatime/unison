import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { todayInJohannesburg } from '../../payments/fields'
import { describeReminders, REMINDER_TOTAL, type ReminderTone } from '../billing-reminders-view'
import { formatDocumentDate } from '../document-view'
import { getInvoiceReminders } from '../queries/get-invoice-reminders'
import { BillingRemindersPauseForm } from './billing-reminders-pause-form'

const TONE_TEXT: Record<ReminderTone, string> = { muted: 'text-muted-foreground', waiting: 'text-foreground', attention: 'text-warning', done: 'text-brand' }

/**
 * The payment reminders of an invoice that belongs to a billing plan (accept to invoice, stage 3): where they stand, the ones already
 * sent, and, for an owner or admin, the pause and resume controls. Nothing is shown for an invoice with no plan, or for a Draft or
 * Cancelled invoice, which nobody is asked to pay. Pausing is available while an invoice can still be reminded, and resuming while it
 * is paused, whatever the switch says: a person may always undo their own pause.
 */
export async function BillingRemindersPanel({ invoiceId }: { invoiceId: string }) {
  const view = await getInvoiceReminders(invoiceId)
  if (!view) return null
  if (view.status === 'Draft' || view.status === 'Cancelled') return null
  const described = describeReminders({ ...view, today: todayInJohannesburg() })
  const canPause = view.canManage && !view.paused && (view.status === 'Issued' || view.status === 'Partially Paid' || view.status === 'Overdue') && view.balance > 0

  return (
    <WorkspaceSection title="Payment reminders" description={`A friendly reminder goes to the client 3 days after the due date and then every week, up to ${REMINDER_TOTAL}.`}>
      <div className="space-y-2 border-b border-border px-5 py-4 text-sm">
        <p className={`min-w-0 break-words font-medium ${TONE_TEXT[described.tone]}`}>{described.line}</p>
      </div>

      {view.sent.length > 0 ? (
        <ul className="divide-y divide-border border-b border-border text-sm">
          {view.sent.map((reminder) => (
            <li key={reminder.sequence} className="flex flex-wrap items-baseline gap-x-3 px-5 py-3">
              <span className="font-medium text-foreground">Reminder {reminder.sequence}</span>
              <span className="text-muted-foreground">{formatDocumentDate(reminder.sentOn) ?? reminder.sentOn}</span>
              <span className="min-w-0 break-words text-muted-foreground">{reminder.to}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {view.canManage && (canPause || view.paused) ? (
        <div className="px-5 py-4 text-sm">
          <BillingRemindersPauseForm invoiceId={invoiceId} paused={!view.paused} />
        </div>
      ) : null}
    </WorkspaceSection>
  )
}
