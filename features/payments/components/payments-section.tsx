import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatAmount, formatDocumentDate } from '../../documents/document-view'
import { getDocument } from '../../documents/queries/get-document'
import { listPayments } from '../queries/list-payments'
import { todayInJohannesburg } from '../fields'
import { RecordPaymentForm } from './record-payment-form'
import { VoidPaymentForm } from './void-payment-form'

/** Record a payment against an issued invoice, and the list of payments (voided ones struck through). */
export async function PaymentsSection({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) return null
  const status = String(bundle.record.status)
  const currency = String(bundle.record.currency ?? 'ZAR')
  const payments = status === 'Draft' ? [] : await listPayments(invoiceId)
  const canPay = status === 'Issued' || status === 'Partially Paid' || status === 'Overdue'
  const note = status === 'Draft'
    ? 'Issue this invoice before recording payments.'
    : status === 'Paid'
      ? 'This invoice is paid in full.'
      : status === 'Cancelled'
        ? 'A cancelled invoice takes no payments.'
        : null
  return (
    <div id="payments" className="scroll-mt-24">
      <WorkspaceSection title="Payments" description="The balance and the status are worked out from these. A wrong payment is voided, never deleted.">
        {canPay ? (
          <RecordPaymentForm invoiceId={invoiceId} balanceLabel={`${currency} ${formatAmount(bundle.record.balance_amount)}`} today={todayInJohannesburg()} />
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">{note}</p>
        )}
        {status !== 'Draft' ? (
          <div className="border-t border-border">
            {payments.length ? (
              <ul className="divide-y divide-border">
                {payments.map((payment) => {
                  const label = `payment of ${currency} ${formatAmount(payment.amount)} on ${formatDocumentDate(payment.receivedOn) ?? payment.receivedOn}`
                  return (
                    <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                      <div className={payment.voided ? 'text-muted-foreground line-through' : 'text-foreground'}>
                        <p className="font-medium">{currency} {formatAmount(payment.amount)} · {payment.method} · {formatDocumentDate(payment.receivedOn) ?? payment.receivedOn}</p>
                        <p className="mt-1 text-xs">{payment.reference ? `${payment.reference} · ` : ''}Recorded by {payment.recordedBy}</p>
                      </div>
                      {payment.voided ? (
                        <p className="text-xs text-muted-foreground">Voided by {payment.voidedBy}: {payment.voidReason}</p>
                      ) : (
                        <VoidPaymentForm paymentId={payment.id} label={label} />
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">No payments recorded yet.</p>
            )}
          </div>
        ) : null}
      </WorkspaceSection>
    </div>
  )
}
