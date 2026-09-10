import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const migrationName = readdirSync("supabase/migrations")
  .find((name) => name.endsWith("_phase_six_commercial_finance.sql"));
assert.ok(migrationName, "Phase 6 migration is missing");
const migration = read("supabase/migrations/" + migrationName);
const queries = read("features/commercial-finance/queries/phase-six.ts");
const actions = read("features/commercial-finance/actions/phase-six.ts");
const form = read("features/commercial-finance/components/phase-six-form.tsx");
const register = read("features/commercial-finance/components/phase-six-register.tsx");
const routes = [
  "app/(unison)/commercial/leads/page.tsx",
  "app/(unison)/commercial/quotes/page.tsx",
  "app/(unison)/commercial/sales/page.tsx",
  "app/(unison)/finance/invoices/page.tsx",
  "app/(unison)/finance/expenses/page.tsx",
  "app/(unison)/finance/forecast/page.tsx",
].map(read).join("\n");

const tables = [
  "leads",
  "sales_opportunities",
  "quotes",
  "invoices",
  "expenses",
  "financial_forecasts",
];

test("Phase 6 tables are tenant isolated, audited and explicitly exposed", () => {
  for (const table of tables) {
    assert.match(migration, new RegExp("create table public\\." + table));
    assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security"));
    assert.match(migration, new RegExp(table + "_set_updated_at"));
    assert.match(migration, new RegExp(table + "_audit"));
  }
  assert.match(migration, /for select to authenticated using \(public\.is_member_of\(organization_id\)\)/);
  assert.match(migration, /grant select, insert, update on[\s\S]+to authenticated/);
  assert.match(migration, /revoke all on[\s\S]+from anon/);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
});

test("all six modules use authenticated server queries and actions", () => {
  assert.match(queries, /import "server-only"/);
  for (const table of tables) {
    assert.match(queries, new RegExp('"' + table + '"'));
  }
  assert.match(queries, /db\.from\(table\)/);
  assert.match(actions, /"use server"/);
  assert.match(actions, /getSessionContext\(\)/);
  assert.match(actions, /eq\("organization_id", organization\.id\)/);
  assert.match(actions, /redirect/);
});

test("commercial and finance routes no longer render fixtures", () => {
  assert.match(routes, /PhaseSixRegister/);
  assert.doesNotMatch(routes, /moduleFixtures|DomainModuleWorkspace/);
  assert.doesNotMatch(register, /moduleFixtures|sessionStorage/);
  assert.match(register, /recordHrefBase/);
});

test("all six create and edit experiences submit persistent forms", () => {
  for (const kind of ["lead", "quote", "opportunity", "invoice", "expense", "forecast"]) {
    assert.match(form, new RegExp('kind === "' + kind + '"|' + kind + ': \\{'));
  }
  assert.match(form, /useActionState/);
  assert.match(form, /savePhaseSixRecordAction\.bind/);
  assert.doesNotMatch(form, /sessionStorage|setTimeout/);
});
