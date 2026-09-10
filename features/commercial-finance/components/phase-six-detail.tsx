import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkPage } from "@/components/shared/work-page";
import {
  getPhaseSixRecord,
  type PhaseSixKind,
  type PhaseSixRecord,
} from "../queries/phase-six";

const meta: Record<PhaseSixKind, { category: string; parent: string; base: string; description: string }> = {
  lead: { category: "Commercial", parent: "Leads", base: "/commercial/leads", description: "Persistent prospect qualification and commercial ownership." },
  quote: { category: "Commercial", parent: "Quotes", base: "/commercial/quotes", description: "Persistent quotation value, validity and commercial decision." },
  opportunity: { category: "Commercial", parent: "Sales", base: "/commercial/sales", description: "Persistent pipeline stage, probability and next-step accountability." },
  invoice: { category: "Finance", parent: "Invoices", base: "/finance/invoices", description: "Persistent billing, collection and payment control." },
  expense: { category: "Finance", parent: "Expenses", base: "/finance/expenses", description: "Persistent operational spend and approval position." },
  forecast: { category: "Finance", parent: "Forecast", base: "/finance/forecast", description: "Persistent financial assumptions, projection and variance." },
};

const fields: Record<PhaseSixKind, Array<[string, string]>> = {
  lead: [
    ["Primary contact", "contactName"], ["Contact email", "contactEmail"],
    ["Contact phone", "contactPhone"], ["Source", "source"], ["Owner", "owner"],
    ["Estimated value", "estimatedValue"], ["Status", "status"],
    ["Last activity", "lastActivityAt"], ["Notes", "notes"],
  ],
  quote: [
    ["Client", "clientName"], ["Client contact", "contactName"], ["Lead", "lead"],
    ["Opportunity", "opportunity"], ["Owner", "owner"], ["Valid until", "validUntil"],
    ["Subtotal", "subtotal"], ["Tax", "taxAmount"], ["Total", "totalAmount"],
    ["Status", "status"], ["Sent", "sentAt"], ["Accepted", "acceptedAt"],
    ["Terms", "terms"], ["Notes", "notes"],
  ],
  opportunity: [
    ["Client / prospect", "clientName"], ["Originating lead", "lead"], ["Owner", "owner"],
    ["Stage", "stage"], ["Expected value", "expectedValue"],
    ["Probability", "probabilityPercent"], ["Expected close", "expectedClose"],
    ["Next step", "nextStep"], ["Lost reason", "lostReason"], ["Won", "wonAt"],
    ["Notes", "notes"],
  ],
  invoice: [
    ["Client", "clientName"], ["Project", "project"], ["Source quote", "quote"],
    ["Opportunity", "opportunity"], ["Finance owner", "owner"],
    ["Issue date", "issueDate"], ["Due date", "dueDate"], ["Subtotal", "subtotal"],
    ["Tax", "taxAmount"], ["Total", "totalAmount"], ["Outstanding balance", "balanceAmount"],
    ["Status", "status"], ["Paid", "paidAt"], ["Payment terms", "paymentTerms"],
    ["Notes", "notes"],
  ],
  expense: [
    ["Category", "category"], ["Vendor", "vendor"], ["Project", "project"],
    ["Client", "client"], ["Submitted by", "submitter"], ["Approved by", "approver"],
    ["Amount", "amount"], ["Expense date", "expenseDate"], ["Status", "status"],
    ["Receipt reference", "receiptReference"], ["Submitted", "submittedAt"],
    ["Approved", "approvedAt"], ["Business purpose", "notes"],
  ],
  forecast: [
    ["Period", "periodLabel"], ["Period start", "periodStart"], ["Period end", "periodEnd"],
    ["Forecast type", "forecastType"], ["Owner", "owner"], ["Actual", "actualValue"],
    ["Projected", "projectedValue"], ["Variance", "varianceValue"],
    ["Confidence", "confidencePercent"], ["Status", "status"],
    ["Assumptions", "assumptions"],
  ],
};

const moneyKeys = new Set([
  "estimatedValue",
  "expectedValue",
  "subtotal",
  "taxAmount",
  "totalAmount",
  "balanceAmount",
  "amount",
  "actualValue",
  "projectedValue",
  "varianceValue",
]);

export async function PhaseSixDetail({ kind, id }: { kind: PhaseSixKind; id: string }) {
  const record = await getPhaseSixRecord(kind, id);
  if (!record) notFound();
  const info = meta[kind];
  return (
    <WorkPage
      category={info.category}
      title={record.name}
      description={info.description}
      parent={{ label: info.parent, href: info.base }}
    >
      <section className="border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border p-6">
          <p className="text-xs tracking-[0.16em] text-brand uppercase">Governed record</p>
          <Link
            href={`${info.base}/${record.id}/edit`}
            className="bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Edit record
          </Link>
        </header>
        <dl className="grid sm:grid-cols-2">
          {fields[kind].map(([label, key]) => (
            <div key={key} className="border-b border-border p-6 sm:odd:border-r">
              <dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
              <dd className="mt-2 whitespace-pre-wrap text-sm font-semibold">
                {formatValue(key, record[key], record)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </WorkPage>
  );
}

function formatValue(key: string, value: unknown, record: PhaseSixRecord) {
  if (value === null || value === undefined || value === "") return "—";
  if (moneyKeys.has(key)) {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: String(record.currency ?? "ZAR"),
    }).format(Number(value));
  }
  if (key === "probabilityPercent" || key === "confidencePercent") return `${value}%`;
  if (key.endsWith("At")) return new Date(String(value)).toLocaleString("en-ZA");
  if (
    key.endsWith("Date") ||
    key === "validUntil" ||
    key === "expectedClose" ||
    key === "periodStart" ||
    key === "periodEnd"
  ) {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-ZA");
  }
  return String(value);
}
