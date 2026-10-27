"use client";

import Link from "next/link";
import { useActionState, useState, type ChangeEvent, type ReactNode } from "react";

import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { PLAN_DRAFT_LOCKED_NOTE } from "@/features/documents/billing-plan-view";
import { BILLING_TERMS_COPY } from "@/features/documents/billing-terms";
import { QUOTE_SENT_STATUSES, isDraftStatus } from "@/features/documents/vocabulary";
import { savePhaseSixRecordAction } from "../actions/phase-six";
import { NameCombobox } from "./name-combobox";
import { packageKeyForName, referenceYear, suggestClientRef, suggestProjectRef } from "../document-references";
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
  const identity = useDocumentIdentity(record, options);

  if (kind === "lead") return (
    <>
      <Field name="companyName" label="Company / prospect" required value={value("companyName", value("name"))} />
      <Field name="contactName" label="Primary contact" required value={value("contactName")} />
      <Field name="contactEmail" label="Contact email" type="email" value={value("contactEmail")} />
      <Field name="contactPhone" label="Contact phone" type="tel" value={value("contactPhone")} />
      <Select name="source" label="Lead source" options={["Referral", "Website", "Campaign", "Event", "Partner", "Outbound", "Other"]} value={value("source", "Referral")} />
      <OptionSelect name="ownerId" label="Lead owner" options={options.members} value={value("ownerId")} optional />
      <MoneyFields amountName="estimatedValue" amountLabel="Estimated value" amount={value("estimatedValue", "0")} currency={value("currency", "ZAR")} />
      <Select name="status" label="Qualification status" options={value("status") === "Converted" ? ["New", "Contacted", "Qualified", "Disqualified", "Converted"] : ["New", "Contacted", "Qualified", "Disqualified"]} value={value("status", "New")} />
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
      <Field name="lostReason" label="Lost reason (required when the stage is Lost)" value={value("lostReason")} />
      <TextArea name="notes" label="Commercial notes" value={value("notes")} />
    </>
  );

  if (kind === "quote") {
    if (record && !isDraftStatus("quote", record.status)) {
      return (
        <>
          <Notice>
            This quote has been sent, so its lines, prices and details are frozen; you can still change its status and notes. To change the rest, use Revise this quote on its page if it is Sent, Declined or Expired (the revision replaces it once sent); an accepted quote cannot be revised, so use Duplicate as new draft.
          </Notice>
          <Select name="status" label="Status" options={QUOTE_SENT_STATUSES.filter((status) => status !== "Superseded" || record.status === "Superseded")} value={value("status", "Sent")} />
          <TextArea name="notes" label="Commercial notes" value={value("notes")} />
        </>
      );
    }
    return (
      <>
        <Notice>The quote number is assigned when the quote is sent. {record ? "Add or change its lines on the quote page." : "Add its lines on the quote page after saving."}</Notice>
        <ClientFields options={options.clients} clientId={identity.clientId} clientName={identity.clientName} onClientId={identity.onClient} onClientName={identity.onClientName} />
        <ClientContactField kind="quote" identity={identity} />
        <OptionSelect name="leadId" label="Related lead" options={options.leads} value={value("leadId")} optional />
        <OptionSelect name="opportunityId" label="Related opportunity" options={options.opportunities} value={value("opportunityId")} optional />
        <OptionSelect name="ownerId" label="Quote owner" options={options.members} value={value("ownerId")} optional />
        <Field name="validUntil" label="Valid until (default 30 days after it is sent)" type="date" value={value("validUntil")} />
        <Field name="startDate" label={BILLING_TERMS_COPY.startDateLabel} type="date" value={value("startDate")} hint={BILLING_TERMS_COPY.helper} />
        <Field name="termMonths" label={BILLING_TERMS_COPY.termLabel} type="number" min={1} max={120} step="1" value={value("termMonths")} hint={BILLING_TERMS_COPY.helper} />
        <Currency value={value("currency", "ZAR")} />
        <ProjectIdentityFields kind="quote" identity={identity} />
        <Select name="status" label="Status" options={["Draft", "Internal Review"]} value={value("status", "Draft")} />
        <TextArea name="projectDescription" label="Project description" value={value("projectDescription")} />
        <TextArea name="terms" label="Terms and conditions (one per line)" value={value("terms", record ? "" : (options.defaults.quoteTerms ?? ""))} />
        <TextArea name="notes" label="Commercial notes (internal)" value={value("notes")} />
      </>
    );
  }

  if (kind === "invoice") {
    if (record && !isDraftStatus("invoice", record.status)) {
      return (
        <>
          <Notice>
            This invoice has been issued, so its lines, prices and details are frozen. Its status and balance are worked out from the payments you record on the invoice page. You can still change the notes. To correct it, cancel it and raise a new one.
          </Notice>
          <TextArea name="notes" label="Payment notes" value={value("notes")} />
        </>
      );
    }
    if (record && typeof record.billingPlanItemId === "string") {
      // A Draft that follows an accepted quote: the database allows only the due date and the notes to change, so nothing else is shown.
      return (
        <>
          <Notice>{PLAN_DRAFT_LOCKED_NOTE}</Notice>
          <Field name="dueDate" label="Due date (default 30 days after it is issued)" type="date" value={value("dueDate")} />
          <TextArea name="notes" label="Payment notes (internal)" value={value("notes")} />
        </>
      );
    }
    return (
      <>
        <Notice>The invoice number is assigned when the invoice is issued. {record ? "Add or change its lines on the invoice page." : "Add its lines on the invoice page after saving."}</Notice>
        <ClientFields options={options.clients} clientId={identity.clientId} clientName={identity.clientName} onClientId={identity.onClient} onClientName={identity.onClientName} />
        <ClientContactField kind="invoice" identity={identity} />
        <OptionSelect name="projectId" label="Delivery project (optional)" options={options.projects} value={value("projectId")} optional />
        <OptionSelect name="quoteId" label="Source quote" options={options.quotes} value={identity.quoteId} onValueChange={identity.onQuote} optional />
        <OptionSelect name="opportunityId" label="Opportunity" options={options.opportunities} value={value("opportunityId")} optional />
        <OptionSelect name="ownerId" label="Finance owner" options={options.members} value={value("ownerId")} optional />
        <Field name="dueDate" label="Due date (default 30 days after it is issued)" type="date" value={value("dueDate")} />
        <Currency value={value("currency", "ZAR")} />
        <ProjectIdentityFields kind="invoice" identity={identity} />
        <TextArea name="projectDescription" label="Project description" value={value("projectDescription")} />
        <TextArea name="paymentTerms" label="Payment terms" value={value("paymentTerms", record ? "" : (options.defaults.paymentTerms ?? ""))} />
        <TextArea name="notes" label="Payment notes (internal)" value={value("notes")} />
      </>
    );
  }

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
  onClientId,
  onClientName,
}: {
  options: SelectOption[];
  clientId: string;
  clientName: string;
  onClientId?: (id: string) => void;
  onClientName?: (name: string) => void;
}) {
  return (
    <>
      <OptionSelect name="clientId" label="Existing client" options={options} value={clientId} onValueChange={onClientId} optional />
      <Field name="clientName" label="Client / prospect name (if not listed)" value={clientName} onValueChange={onClientName} />
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

function Notice({ children }: { children: ReactNode }) {
  return <p className="border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:col-span-2">{children}</p>;
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
  onValueChange,
  hint,
}: {
  name: string;
  label: string;
  value?: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  /** Given, the field is controlled by its parent (value is then the current text); otherwise value is only the starting text. */
  onValueChange?: (value: string) => void;
  hint?: string;
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
        {...(onValueChange
          ? { value: value ?? "", onChange: (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value) }
          : { defaultValue: value ?? "" })}
        className={inputClass}
      />
      {hint ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span> : null}
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
  onValueChange,
}: {
  name: string;
  label: string;
  value?: string;
  options: SelectOption[];
  optional?: boolean;
  /** Given, the select is controlled by its parent (value is then the current choice); otherwise value is only the starting choice. */
  onValueChange?: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        name={name}
        {...(onValueChange
          ? { value: value ?? "", onChange: (event: ChangeEvent<HTMLSelectElement>) => onValueChange(event.target.value) }
          : { defaultValue: value ?? "" })}
        className={inputClass}
      >
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

type DocumentIdentity = ReturnType<typeof useDocumentIdentity>;

/**
 * The state behind a quote or invoice form's package, client, project name and references. On a NEW document picking a
 * package or a listed name fills the project name and a suggested project reference, picking a client fills a suggested
 * client reference, and an invoice raised from a quote takes the quote's name and references. A field the person has
 * typed in is never overwritten. On an existing document nothing is filled in.
 */
function useDocumentIdentity(record: PhaseSixRecord | null | undefined, options: PhaseSixOptions) {
  const initial = (key: string) => String(record?.[key] ?? "");
  const fresh = !record;
  const [packageKey, setPackageKey] = useState(""); // the HIVE offering key a listed project name stands for; used only to suggest a reference
  const [projectName, setProjectName] = useState(initial("projectName"));
  const [projectRef, setProjectRef] = useState(initial("projectRef"));
  const [clientRef, setClientRef] = useState(initial("clientRef"));
  const [clientId, setClientId] = useState(initial("clientId"));
  const [clientName, setClientName] = useState(initial("clientName"));
  const [quoteId, setQuoteId] = useState(initial("quoteId"));
  const [contactName, setContactName] = useState(initial("contactName"));
  const [typed, setTyped] = useState({ projectName: false, projectRef: false, clientRef: false, contactName: false });
  const markTyped = (field: keyof typeof typed, isTyped: boolean) => setTyped((current) => ({ ...current, [field]: isTyped }));

  const fillProjectRef = (key: string | null) => {
    if (fresh && !typed.projectRef) setProjectRef(suggestProjectRef(key, referenceYear(), options.references.projectRefs));
  };
  const fillClientRef = (id: string, name: string) => {
    if (!fresh || typed.clientRef) return;
    const label = options.clients.find((client) => client.id === id)?.label ?? name;
    setClientRef(suggestClientRef(label, referenceYear(), options.references.clientRefs));
  };

  return {
    fresh,
    projectNames: options.projectNames,
    projectName,
    projectRef,
    clientRef,
    clientId,
    clientName,
    quoteId,
    contactName,
    /** The chosen client's CRM contacts, primary first; empty when no client is chosen or it has none. */
    contactSuggestions: options.contactsByClient[clientId] ?? [],
    onContact(text: string) {
      setContactName(text);
      markTyped("contactName", text.trim() !== "");
    },
    onProjectName(text: string) {
      setProjectName(text);
      const key = packageKeyForName(text, options.projectNames);
      markTyped("projectName", text.trim() !== "" && key === null);
      if (!fresh) return;
      if (key) setPackageKey(key);
      fillProjectRef(key ?? (packageKey || null));
    },
    onProjectRef(text: string) {
      setProjectRef(text);
      markTyped("projectRef", text.trim() !== "");
    },
    onClientRef(text: string) {
      setClientRef(text);
      markTyped("clientRef", text.trim() !== "");
    },
    onClient(id: string) {
      setClientId(id);
      if (fresh && !typed.contactName) setContactName(options.contactsByClient[id]?.[0] ?? "");
      fillClientRef(id, clientName);
    },
    onClientName(text: string) {
      setClientName(text);
      fillClientRef(clientId, text);
    },
    onQuote(id: string) {
      setQuoteId(id);
      const details = options.quoteDetails[id];
      if (!fresh || !details) return;
      if (details.projectName && !typed.projectName) {
        setProjectName(details.projectName);
        const key = packageKeyForName(details.projectName, options.projectNames);
        if (key) setPackageKey(key);
      }
      if (details.projectRef && !typed.projectRef) setProjectRef(details.projectRef);
      if (details.clientRef && !typed.clientRef) setClientRef(details.clientRef);
      if (details.contactName && !typed.contactName) setContactName(details.contactName);
    },
  };
}

/** The person at the client the document is addressed to: pick one of the client's CRM contacts or type a name. It is printed under the client's name. */
function ClientContactField({ kind, identity }: { kind: "quote" | "invoice"; identity: DocumentIdentity }) {
  return (
    <NameCombobox
      name="contactName"
      label="Client contact"
      value={identity.contactName}
      onValueChange={identity.onContact}
      suggestions={identity.contactSuggestions}
      hint={`Printed on the ${kind} under the client's name. Pick one of the client's contacts or type a name.`}
    />
  );
}

/** The project name (picked from the HIVE names or typed) and the two references of a quote or invoice. */
function ProjectIdentityFields({ kind, identity }: { kind: "quote" | "invoice"; identity: DocumentIdentity }) {
  return (
    <>
      <NameCombobox
        name="projectName"
        label={`Project name (printed on the ${kind})`}
        value={identity.projectName}
        onValueChange={identity.onProjectName}
        suggestions={identity.projectNames.map((entry) => entry.name)}
        hint="Pick a retainer or project from the list, or type your own."
      />
      <Field
        name="projectRef"
        label="Project reference"
        value={identity.projectRef}
        onValueChange={identity.onProjectRef}
        hint={identity.fresh ? "Filled in from the project name. Change it if you need to." : undefined}
      />
      <Field
        name="clientRef"
        label="Client reference"
        value={identity.clientRef}
        onValueChange={identity.onClientRef}
        hint={identity.fresh ? "Filled in from the client. Type over it to use their own reference, such as a PO number." : undefined}
      />
    </>
  );
}
