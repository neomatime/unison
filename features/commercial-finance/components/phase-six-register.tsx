import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { MetricCard } from "@/features/delivery/components/delivery-primitives";
import {
  RecordCollectionWorkspace,
  type CollectionRecord,
} from "@/features/product-ui/components/record-collection-workspace";
import {
  listExpenses,
  listForecasts,
  listInvoices,
  listLeads,
  listOpportunities,
  listQuotes,
  type PhaseSixKind,
  type PhaseSixRecord,
} from "../queries/phase-six";

const loaders: Record<PhaseSixKind, () => Promise<PhaseSixRecord[]>> = {
  lead: listLeads,
  quote: listQuotes,
  opportunity: listOpportunities,
  invoice: listInvoices,
  expense: listExpenses,
  forecast: listForecasts,
};

const text = (value: unknown, fallback = "—") =>
  value === null || value === undefined || value === "" ? fallback : String(value);
const date = (value: unknown) =>
  value ? new Date(`${String(value)}T00:00:00`).toLocaleDateString("en-ZA") : "—";
const money = (value: unknown, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
const sum = (rows: PhaseSixRecord[], key: string) =>
  rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

export async function PhaseSixRegister({ kind }: { kind: PhaseSixKind }) {
  const rows = await loaders[kind]();
  const active = rows.filter((row) => !row.archivedAt);
  const config = registerConfig(kind, active);
  return (
    <>
      <WorkspaceHeader
        category={config.category}
        title={config.heading}
        description={config.description}
        action={config.action}
        actionHref={`${config.base}/new`}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {config.metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
          />
        ))}
      </div>
      <div className="mt-5">
        <RecordCollectionWorkspace config={{
          title: `${config.singular} Register`,
          singular: config.singular,
          description: config.registerDescription,
          primaryAction: config.action,
          records: config.records,
          recordHrefBase: config.base,
          columns: config.columns,
          fields: [],
          contextualActions: [],
          emptyDescription: config.empty,
        }} />
      </div>
    </>
  );
}

function registerConfig(kind: PhaseSixKind, rows: PhaseSixRecord[]) {
  if (kind === "lead") {
    const qualified = rows.filter((row) => row.status === "Qualified");
    return {
      category: "Commercial",
      heading: "Leads",
      singular: "Lead",
      action: "Add Lead",
      base: "/commercial/leads",
      description: "Qualify persistent prospects, value and commercial ownership.",
      registerDescription: "Tenant-scoped prospective organizations and qualification position.",
      empty: "Add the first commercial lead.",
      metrics: [
        { label: "Active leads", value: String(rows.length), detail: "Persistent prospects" },
        { label: "Qualified", value: String(qualified.length), detail: "Ready for opportunity conversion" },
        { label: "Estimated value", value: money(sum(rows, "estimatedValue")), detail: "Recorded pipeline potential" },
      ],
      records: rows.map((row): CollectionRecord => ({
        id: row.id,
        name: row.name,
        context: text(row.contactEmail),
        contact: text(row.contactName),
        source: text(row.source),
        owner: text(row.owner),
        value: money(row.estimatedValue, text(row.currency, "ZAR")),
        status: row.status,
        updated: date(String(row.updatedAt).slice(0, 10)),
      })),
      columns: [
        { id: "name", label: "Company" },
        { id: "contact", label: "Contact" },
        { id: "source", label: "Source" },
        { id: "owner", label: "Owner" },
        { id: "value", label: "Estimated Value" },
        { id: "status", label: "Status" },
      ],
    };
  }
  if (kind === "quote") {
    const accepted = rows.filter((row) => row.status === "Accepted");
    return {
      category: "Commercial",
      heading: "Quotes",
      singular: "Quote",
      action: "New Quote",
      base: "/commercial/quotes",
      description: "Prepare and govern persistent client quotations and commercial terms.",
      registerDescription: "Quote ownership, value, validity and decision status.",
      empty: "Create the first client quote.",
      metrics: [
        { label: "Active quotes", value: String(rows.length), detail: "Across all current statuses" },
        { label: "Accepted", value: String(accepted.length), detail: "Commercially approved" },
        { label: "Quoted value", value: money(sum(rows, "totalAmount")), detail: "Total recorded value" },
      ],
      records: rows.map((row): CollectionRecord => ({
        id: row.id,
        name: row.name,
        context: text(row.opportunity),
        client: text(row.clientName),
        owner: text(row.owner),
        total: money(row.totalAmount, text(row.currency, "ZAR")),
        expiry: date(row.validUntil),
        status: row.status,
        updated: date(String(row.updatedAt).slice(0, 10)),
      })),
      columns: [
        { id: "name", label: "Quote" },
        { id: "client", label: "Client" },
        { id: "owner", label: "Owner" },
        { id: "total", label: "Total" },
        { id: "expiry", label: "Expiry" },
        { id: "status", label: "Status" },
      ],
    };
  }
  if (kind === "opportunity") {
    const open = rows.filter((row) => !["Won", "Lost"].includes(row.status));
    const weighted = rows.reduce(
      (total, row) => total + Number(row.expectedValue ?? 0) * Number(row.probabilityPercent ?? 0) / 100,
      0,
    );
    return {
      category: "Commercial",
      heading: "Sales",
      singular: "Opportunity",
      action: "New Opportunity",
      base: "/commercial/sales",
      description: "Manage a persistent pipeline from discovery through commercial outcome.",
      registerDescription: "Opportunity stage, value, probability and next-step accountability.",
      empty: "Create the first sales opportunity.",
      metrics: [
        { label: "Open opportunities", value: String(open.length), detail: "Active commercial pipeline" },
        { label: "Pipeline value", value: money(sum(open, "expectedValue")), detail: "Unweighted opportunity value" },
        { label: "Weighted forecast", value: money(weighted), detail: "Probability-adjusted value" },
      ],
      records: rows.map((row): CollectionRecord => ({
        id: row.id,
        name: row.name,
        context: text(row.nextStep),
        client: text(row.clientName),
        owner: text(row.owner),
        stage: text(row.stage),
        value: money(row.expectedValue, text(row.currency, "ZAR")),
        probability: `${text(row.probabilityPercent, "0")}%`,
        close: date(row.expectedClose),
        status: row.status,
        updated: date(String(row.updatedAt).slice(0, 10)),
      })),
      columns: [
        { id: "name", label: "Opportunity" },
        { id: "client", label: "Client / Prospect" },
        { id: "owner", label: "Owner" },
        { id: "stage", label: "Stage" },
        { id: "value", label: "Value" },
        { id: "probability", label: "Probability" },
        { id: "close", label: "Expected Close" },
      ],
    };
  }
  if (kind === "invoice") {
    const outstanding = rows.filter((row) => Number(row.balanceAmount ?? 0) > 0);
    const overdue = rows.filter((row) => row.status === "Overdue");
    return {
      category: "Finance",
      heading: "Invoices",
      singular: "Invoice",
      action: "New Invoice",
      base: "/finance/invoices",
      description: "Control persistent client billing, balances and payment status.",
      registerDescription: "Tenant-scoped billing records and collection position.",
      empty: "Create the first client invoice.",
      metrics: [
        { label: "Invoices", value: String(rows.length), detail: "Current billing records" },
        { label: "Outstanding", value: money(sum(outstanding, "balanceAmount")), detail: "Balance still collectible" },
        { label: "Overdue", value: String(overdue.length), detail: "Invoices requiring attention" },
      ],
      records: rows.map((row): CollectionRecord => ({
        id: row.id,
        name: row.name,
        context: text(row.project),
        client: text(row.clientName),
        owner: text(row.owner),
        issueDate: date(row.issueDate),
        due: date(row.dueDate),
        total: money(row.totalAmount, text(row.currency, "ZAR")),
        balance: money(row.balanceAmount, text(row.currency, "ZAR")),
        status: row.status,
        updated: date(String(row.updatedAt).slice(0, 10)),
      })),
      columns: [
        { id: "name", label: "Invoice" },
        { id: "client", label: "Client" },
        { id: "issueDate", label: "Issue Date" },
        { id: "due", label: "Due Date" },
        { id: "total", label: "Total" },
        { id: "balance", label: "Balance" },
        { id: "status", label: "Status" },
      ],
    };
  }
  if (kind === "expense") {
    const pending = rows.filter((row) => ["Submitted", "Awaiting Approval"].includes(row.status));
    const approved = rows.filter((row) => row.status === "Approved");
    return {
      category: "Finance",
      heading: "Expenses",
      singular: "Expense",
      action: "Add Expense",
      base: "/finance/expenses",
      description: "Capture persistent operational spend and approval accountability.",
      registerDescription: "Expense allocation, evidence reference and approval state.",
      empty: "Add the first operational expense.",
      metrics: [
        { label: "Recorded expenses", value: money(sum(rows, "amount")), detail: "Current tenant spend" },
        { label: "Awaiting approval", value: String(pending.length), detail: "Submitted control items" },
        { label: "Approved", value: money(sum(approved, "amount")), detail: "Approved recorded spend" },
      ],
      records: rows.map((row): CollectionRecord => ({
        id: row.id,
        name: row.name,
        context: text(row.notes),
        category: text(row.category),
        vendor: text(row.vendor),
        project: text(row.project),
        owner: text(row.submitter),
        amount: money(row.amount, text(row.currency, "ZAR")),
        date: date(row.expenseDate),
        status: row.status,
        updated: date(String(row.updatedAt).slice(0, 10)),
      })),
      columns: [
        { id: "name", label: "Expense" },
        { id: "category", label: "Category" },
        { id: "vendor", label: "Vendor" },
        { id: "project", label: "Project" },
        { id: "owner", label: "Submitted By" },
        { id: "amount", label: "Amount" },
        { id: "date", label: "Date" },
        { id: "status", label: "Status" },
      ],
    };
  }
  const current = rows.filter((row) => row.status === "Current");
  return {
    category: "Finance",
    heading: "Forecast",
    singular: "Scenario",
    action: "New Scenario",
    base: "/finance/forecast",
    description: "Model persistent revenue, expense, cash-flow and budget scenarios.",
    registerDescription: "Forecast assumptions, actuals, projections and confidence.",
    empty: "Create the first financial forecast scenario.",
    metrics: [
      { label: "Scenarios", value: String(rows.length), detail: "Persistent forecast models" },
      { label: "Current projections", value: money(sum(current, "projectedValue")), detail: "Across current scenarios" },
      { label: "Current variance", value: money(sum(current, "varianceValue")), detail: "Projection less actual" },
    ],
    records: rows.map((row): CollectionRecord => ({
      id: row.id,
      name: row.name,
      context: text(row.forecastType),
      period: text(row.periodLabel),
      actual: money(row.actualValue, text(row.currency, "ZAR")),
      projected: money(row.projectedValue, text(row.currency, "ZAR")),
      variance: money(row.varianceValue, text(row.currency, "ZAR")),
      confidence: `${text(row.confidencePercent, "0")}%`,
      owner: text(row.owner),
      status: row.status,
      updated: date(String(row.updatedAt).slice(0, 10)),
    })),
    columns: [
      { id: "name", label: "Forecast" },
      { id: "period", label: "Period" },
      { id: "actual", label: "Actual" },
      { id: "projected", label: "Projected" },
      { id: "variance", label: "Variance" },
      { id: "confidence", label: "Confidence" },
      { id: "status", label: "Status" },
    ],
  };
}
