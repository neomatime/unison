import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260910130142_portfolio_executive_visibility.sql",
);
const portfolioQuery = read(
  "features/delivery/queries/portfolio-management.ts",
);
const portfolioScreen = read(
  "features/delivery/components/portfolio-screen.tsx",
);
const detail = read("features/delivery/components/portfolio-detail-screen.tsx");
const form = read("features/delivery/components/portfolio-form.tsx");
const approvalScreen = read(
  "features/delivery/components/approvals-screen.tsx",
);
const collectionWorkspace = read(
  "features/product-ui/components/record-collection-workspace.tsx",
);

test("portfolio and programme records are tenant isolated and persistent", () => {
  for (const table of ["portfolios", "programmes"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(migration, new RegExp(`create policy ${table}_select`));
  }
  assert.match(
    migration,
    /projects add column portfolio_id uuid, add column programme_id uuid/,
  );
  assert.match(form, /savePortfolioAction/);
  assert.match(form, /saveProgrammeAction/);
  assert.doesNotMatch(portfolioScreen, /portfolio-data|deliveryMetrics/);
});

test("executive visibility is calculated from governance records", () => {
  for (const table of [
    "approvals",
    "governance_gates",
    "governance_artefacts",
    "project_risks",
    "project_decisions",
    "project_dependencies",
  ])
    assert.match(portfolioQuery, new RegExp(`from\\(["']${table}["']\\)`));
  assert.match(detail, /ExecutiveVisibility/);
  assert.match(detail, /Executive visibility/);
});

test("server-fetched registers pass only serializable routing config to the client", () => {
  for (const screen of [portfolioScreen, approvalScreen]) {
    assert.match(screen, /recordHrefBase:/);
    assert.doesNotMatch(screen, /recordHref:\s*\(/);
  }
  assert.match(collectionWorkspace, /recordHrefBase\?: string/);
  assert.match(collectionWorkspace, /encodeURIComponent\(record\.id\)/);
});
