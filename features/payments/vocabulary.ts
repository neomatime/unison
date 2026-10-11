// Shared by the form, the actions and unit tests: no directive, no imports. The list equals the payments.method check.
export const PAYMENT_METHODS = ['Bank transfer', 'Card', 'Cash', 'Other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}
