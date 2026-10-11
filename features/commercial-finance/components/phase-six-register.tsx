import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { MetricCard } from "@/features/delivery/components/delivery-primitives";
import { formatCurrency } from "@/lib/utils/format-money";
import { portableDefinitions } from "@/features/data-portability/portable-collections";
import { RegisterScreen } from "@/features/registers/components/register-screen";
import { isRegisterKind } from "@/features/registers/register-spec";
import type { RawParams } from "@/features/registers/read-register-params";
import {
  RecordCollectionWorkspace,
  type CollectionRecord,
} from "@/features/product-ui/components/record-collection-workspace";
import {
  listForecasts,
  type PhaseSixKind,
  type PhaseSixRecord,
} from "../queries/phase-six";

const text = (value: unknown, fallback = "—") =>
  value === null || value === undefined || value === "" ? fallback : String(value);
const date = (value: unknown) =>
  value ? new Date(`${String(value)}T00:00:00`).toLocaleDateString("en-ZA") : "—";
const money = (value: unknown, currency = "ZAR") =>
  formatCurrency(Number(value ?? 0), currency, { maximumFractionDigits: 0 });
const sum = (rows: PhaseSixRecord[], key: string) =>
  rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

// The five registers (leads, quotes, sales, invoices, expenses) are the server-driven RegisterScreen. The forecast
// rendering below is kept as it was; no route reaches it since the forecast became its own screen.
export async function PhaseSixRegister({ kind, searchParams = {} }: { kind: PhaseSixKind; searchParams?: RawParams }) {
  if (isRegisterKind(kind)) return <RegisterScreen kind={kind} searchParams={searchParams} />;
  const rows = await listForecasts();
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
        hideActionOnPhone={active.length === 0}
      />
      {active.length ? <div className="grid gap-3 sm:grid-cols-3">
        {config.metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
          />
        ))}
      </div> : null}
      <div className="mt-5">
        <RecordCollectionWorkspace config={{
          title: `${config.singular} Register`,
          singular: config.singular,
          description: config.registerDescription,
          primaryAction: config.action,
          hideHeaderAction: true,
          records: config.records,
          recordHrefBase: config.base,
          columns: config.columns,
          fields: [],
          contextualActions: [],
          allowImport: Boolean(portableDefinitions["financial-forecasts"].importColumns),
          portableCollection: "financial-forecasts",
          emptyDescription: config.empty,
        }} />
      </div>
    </>
  );
}

function registerConfig(kind: PhaseSixKind, rows: PhaseSixRecord[]) {
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
