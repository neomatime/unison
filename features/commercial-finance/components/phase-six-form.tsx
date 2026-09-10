"use client";

import Link from "next/link";
import { useActionState } from "react";

import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { savePhaseSixRecordAction } from "../actions/phase-six";
import type {
  PhaseSixKind,
  PhaseSixOptions,
  PhaseSixRecord,
  SelectOption,
} from "../queries/phase-six";

const meta: Record<PhaseSixKind, { category: string; title: string; parent: string; base: string }> = {
  lead: { category: "Commercial", title: "Lead", parent: "Leads", base: "/commercial/leads" },
  quote: { category: "Commercial", title: "Quote", parent: "Quotes", base: "/commercial/quotes" },
  opportunity: { category: "Commercial", title: "Opportunity", parent: "Sales", base: "/commercial/sales" },
  invoice: { category: "Finance", title: "Invoice", parent: "Invoices", base: "/finance/invoices" },
  expense: { category: "Finance", title: "Expense", parent: "Expenses", base: "/finance/expenses" },
  forecast: { category: "Finance", title: "Forecast Scenario", parent: "Forecast", base: "/finance/forecast" },
};

const inputClass =
  "mt-1.5 h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand";

export function PhaseSixForm({
  kind,
  record,
  options,
}: {
  kind: PhaseSixKind;
  record?: PhaseSixRecord | null;
  options: PhaseSixOptions;
}) {
  const action = savePhaseSixRecordAction.bind(null, kind, record?.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const info = meta[kind];
  return (
    <>
      <WorkspaceHeader
        category={info.category}
        parent={{ label: info.parent, href: info.base }}
        title={`${record ? "Edit" : "New"} ${info.title}`}
        description={`Capture the governed ${info.title.toLowerCase()} record in the active organization.`}
      />
      <form action={formAction} className="mx-auto max-w-5xl border border-border bg-card">
        <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
          <Fields kind={kind} record={record} options={options} />
        </div>
        {state?.error ? (
          <p role="alert" className="mx-6 mb-4 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <footer className="flex justify-end gap-2 border-t border-border p-5">
          <Link
            href={record ? `${info.base}/${record.id}` : info.base}
            className="border border-border px-4 py-2 text-sm font-medium"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : `Save ${info.title}`}
          </button>
        </footer>
      </form>
    </>
  );
}

function Fields({
  kind,
  record,
  options,
}: {
  kind: PhaseSixKind;
  record?: PhaseSixRecord | null;
  options: PhaseSixOptions;
}) {
  const value = (key: string, fallback = "") =>
    String(record?.[key] ?? fallback);

  if (kind === "lead") return (
    <>
      <Field name="companyName" label="Company / prospect" required value={value("companyName", value("name"))} />
      <Field name="contactName" label="Primary contact" required value={value("contactName")} />
      <Field name="contactEmail" label="Contact email" type="email" value={value("contactEmail")} />
      <Field name="contactPhone" label="Contact phone" type="tel" value={value("contactPhone")} />
      <Select name="source" label="Lead source" options={["Referral", "Website", "Campaign", "Event", "Partner", "Outbound", "Other"]} value={value("source", "Referral")} />
      <OptionSelect name="ownerId" label="Lead owner" options={options.members} value={value("ownerId")} optional />
      <MoneyFields amountName="estimatedValue" amountLabel="Estimated value" amount={value("estimatedValue", "0")} currency={value("currency", "ZAR")} />
      <Select name="status" label="Qualification status" options={["New", "Contacted", "Qualified", "Disqualified", "Converted"]} value={value("status", "New")} />
      <TextArea name="notes" label="Qualification notes" value={value("notes")} />
    </>
  );

  if (kind === "opportunity") return (
    <>
      <Field name="name" label="Opportunity name" required value={value("name")} />
      <ClientFields options={options.clients} clientId={value("clientId")} clientName={value("clientName")} />
      <OptionSelect name="leadId" label="Originating lead" options={options.leads} value={value("leadId")} optional />
      <OptionSelect name="ownerId" label="Opportunity owner" options={options.members} value={value("ownerId")} optional />
      <Select name="stage" label="Pipeline stage" options={["Discovery", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]} value={value("stage", "Discovery")} />
      <MoneyFields amountName="expectedValue" amountLabel="Expected value" amount={value("expectedValue", "0")} currency={value("currency", "ZAR")} />
      <Field name="probabilityPercent" label="Probability (%)" type="number" min={0} max={100} value={value("probabilityPercent", "0")} />
      <Field name="expectedClose" label="Expected close" type="date" value={value("expectedClose")} />
      <Field name="nextStep" label="Next step" value={value("nextStep")} />
      <Field name="lostReason" label="Lost reason" value={value("lostReason")} />
      <TextArea name="notes" label="Commercial notes" value={value("notes")} />
    </>
  );

  if (kind === "quote") return (
    <>
      <Field name="quoteNumber" label="Quote number" required value={value("quoteNumber", value("name"))} />
      <ClientFields options={options.clients} clientId={value("clientId")} clientName={value("clientName")} />
      <Field name="contactName" label="Client contact" value={value("contactName")} />
      <OptionSelect name="leadId" label="Related lead" options={options.leads} value={value("leadId")} optional />
      <OptionSelect name="opportunityId" label="Related opportunity" options={options.opportunities} value={value("opportunityId")} optional />
      <OptionSelect name="ownerId" label="Quote owner" options={options.members} value={value("ownerId")} optional />
      <Field name="validUntil" label="Valid until" type="date" value={value("validUntil")} />
      <Field name="subtotal" label="Subtotal" type="number" min={0} step="0.01" value={value("subtotal", "0")} />
      <Field name="taxAmount" label="Tax amount" type="number" min={0} step="0.01" value={value("taxAmount", "0")} />
      <Field name="totalAmount" label="Quote total" type="number" min={0} step="0.01" value={value("totalAmount")} />
      <Currency value={value("currency", "ZAR")} />
      <Select name="status" label="Status" options={["Draft", "Internal Review", "Sent", "Accepted", "Declined", "Expired"]} value={value("status", "Draft")} />
      <TextArea name="terms" label="Terms and conditions" value={value("terms")} />
      <TextArea name="notes" label="Commercial notes" value={value("notes")} />
    </>
  );

  if (kind === "invoice") return (
    <>
      <Field name="invoiceNumber" label="Invoice number" required value={value("invoiceNumber", value("name"))} />
      <ClientFields options={options.clients} clientId={value("clientId")} clientName={value("clientName")} />
      <OptionSelect name="projectId" label="Project" options={options.projects} value={value("projectId")} optional />
      <OptionSelect name="quoteId" label="Source quote" options={options.quotes} value={value("quoteId")} optional />
      <OptionSelect name="opportunityId" label="Opportunity" options={options.opportunities} value={value("opportunityId")} optional />
      <OptionSelect name="ownerId" label="Finance owner" options={options.members} value={value("ownerId")} optional />
      <Field name="issueDate" label="Issue date" type="date" value={value("issueDate")} />
      <Field name="dueDate" label="Due date" type="date" value={value("dueDate")} />
      <Field name="subtotal" label="Subtotal" type="number" min={0} step="0.01" value={value("subtotal", "0")} />
      <Field name="taxAmount" label="Tax amount" type="number" min={0} step="0.01" value={value("taxAmount", "0")} />
      <Field name="totalAmount" label="Invoice total" type="number" min={0} step="0.01" value={value("totalAmount")} />
      <Field name="balanceAmount" label="Outstanding balance" type="number" min={0} step="0.01" value={value("balanceAmount")} />
      <Currency value={value("currency", "ZAR")} />
      <Select name="status" label="Payment status" options={["Draft", "Issued", "Partially Paid", "Paid", "Overdue", "Cancelled"]} value={value("status", "Draft")} />
      <TextArea name="paymentTerms" label="Payment terms" value={value("paymentTerms")} />
      <TextArea name="notes" label="Payment notes" value={value("notes")} />
    </>
  );

  if (kind === "expense") return (
    <>
      <Field name="description" label="Expense description" required value={value("description", value("name"))} />
      <Select name="category" label="Category" options={["Travel", "Software", "Professional Services", "Office", "Marketing", "Events", "Other"]} value={value("category", "Other")} />
      <OptionSelect name="vendorId" label="Existing vendor" options={options.vendors} value={value("vendorId")} optional />
      <Field name="vendorName" label="Vendor name (if not listed)" value={value("vendorName")} />
      <OptionSelect name="projectId" label="Project" options={options.projects} value={value("projectId")} optional />
      <OptionSelect name="clientId" label="Client" options={options.clients} value={value("clientId")} optional />
      <OptionSelect name="submittedBy" label="Submitted by" options={options.members} value={value("submittedBy")} optional />
      <OptionSelect name="approvedBy" label="Approved by" options={options.members} value={value("approvedBy")} optional />
      <MoneyFields amountName="amount" amountLabel="Amount" amount={value("amount", "0")} currency={value("currency", "ZAR")} required />
      <Field name="expenseDate" label="Expense date" type="date" required value={value("expenseDate")} />
      <Select name="status" label="Approval status" options={["Draft", "Submitted", "Awaiting Approval", "Approved", "Rejected"]} value={value("status", "Draft")} />
      <Field name="receiptReference" label="Receipt reference" value={value("receiptReference")} />
      <TextArea name="notes" label="Business purpose" value={value("notes")} />
    </>
  );

  return (
    <>
      <Field name="name" label="Scenario name" required value={value("name")} />
      <Field name="periodLabel" label="Forecast period" required value={value("periodLabel")} />
      <Field name="periodStart" label="Period start" type="date" value={value("periodStart")} />
      <Field name="periodEnd" label="Period end" type="date" value={value("periodEnd")} />
      <Select name="forecastType" label="Forecast type" options={["Revenue", "Expenses", "Cash Flow", "Budget vs Actual"]} value={value("forecastType", "Revenue")} />
      <OptionSelect name="ownerId" label="Scenario owner" options={options.members} value={value("ownerId")} optional />
      <Field name="actualValue" label="Actual value" type="number" step="0.01" value={value("actualValue", "0")} />
      <Field name="projectedValue" label="Projected value" type="number" step="0.01" value={value("projectedValue", "0")} />
      <Field name="confidencePercent" label="Confidence (%)" type="number" min={0} max={100} value={value("confidencePercent", "50")} />
      <Currency value={value("currency", "ZAR")} />
      <Select name="status" label="Scenario status" options={["Draft", "Current", "Approved", "Archived"]} value={value("status", "Draft")} />
      <TextArea name="assumptions" label="Assumptions and methodology" value={value("assumptions")} />
    </>
  );
}

function ClientFields({
  options,
  clientId,
  clientName,
}: {
  options: SelectOption[];
  clientId: string;
  clientName: string;
}) {
  return (
    <>
      <OptionSelect name="clientId" label="Existing client" options={options} value={clientId} optional />
      <Field name="clientName" label="Client / prospect name (if not listed)" value={clientName} />
    </>
  );
}

function MoneyFields({
  amountName,
  amountLabel,
  amount,
  currency,
  required,
}: {
  amountName: string;
  amountLabel: string;
  amount: string;
  currency: string;
  required?: boolean;
}) {
  return (
    <>
      <Field name={amountName} label={amountLabel} type="number" min={0} step="0.01" required={required} value={amount} />
      <Currency value={currency} />
    </>
  );
}

function Currency({ value }: { value: string }) {
  return <Select name="currency" label="Currency" options={["ZAR", "USD", "GBP", "EUR"]} value={value} />;
}

function Field({
  name,
  label,
  value,
  type = "text",
  required,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  value?: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
        defaultValue={value ?? ""}
        className={inputClass}
      />
    </label>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: string[];
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select name={name} defaultValue={value ?? options[0]} className={inputClass}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function OptionSelect({
  name,
  label,
  value,
  options,
  optional,
}: {
  name: string;
  label: string;
  value?: string;
  options: SelectOption[];
  optional?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select name={name} defaultValue={value ?? ""} className={inputClass}>
        <option value="">{optional ? "Unassigned" : "Select…"}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function TextArea({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: string;
}) {
  return (
    <label className="text-sm font-medium md:col-span-2">
      {label}
      <textarea
        name={name}
        rows={4}
        defaultValue={value ?? ""}
        className={`${inputClass} h-auto py-3`}
      />
    </label>
  );
}
