import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260910171605_phase_four_team_operational_delivery.sql");
const queries = read("features/operations/queries/phase-four.ts");
const actions = read("features/operations/actions/phase-four.ts");
const form = read("features/operations/components/phase-four-form.tsx");
const register = read("features/operations/components/phase-four-register.tsx");
const routes = [
  "app/(unison)/people/team/page.tsx",
  "app/(unison)/operations/onboarding/page.tsx",
  "app/(unison)/delivery/vendors/page.tsx",
  "app/(unison)/operations/tasks/page.tsx",
  "app/(unison)/operations/calendar/page.tsx",
].map(read).join("\n");

const tables = [
  "team_members",
  "project_assignments",
  "client_onboardings",
  "vendors",
  "tasks",
  "calendar_events",
];

test("phase four records are persistent, tenant isolated and explicitly exposed", () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`create policy ${table}_select`));
    assert.match(migration, new RegExp(`${table}_set_updated_at`));
    assert.match(migration, new RegExp(`${table}_audit`));
  }
  assert.match(migration, /grant select, insert, update on public\.team_members/);
  assert.match(migration, /revoke all on public\.team_members[\s\S]+from anon/);
  assert.doesNotMatch(migration, /auth\.role\(\) = 'authenticated'/);
});

test("phase four server queries and actions cover every operational table", () => {
  assert.match(queries, /import "server-only"/);
  for (const table of tables) {
    assert.match(queries, new RegExp(`from\\(\\"${table}\\"\\)`));
  }
  assert.match(actions, /"use server"/);
  assert.match(actions, /getSessionContext\(\)/);
  assert.match(actions, /eq\("organization_id", organization\.id\)/);
  assert.match(actions, /redirect\(`/);
});

test("team, onboarding, vendors, tasks and calendar no longer render fixtures", () => {
  assert.match(routes, /PersistentTeamScreen/);
  assert.match(routes, /PhaseFourRegister/);
  assert.doesNotMatch(routes, /moduleFixtures|teamMembers|projectAssignments|onboardings|vendors from/);
  assert.doesNotMatch(register, /sessionStorage|moduleFixtures/);
  assert.match(register, /recordHrefBase/);
});

test("all six create and edit experiences submit through authenticated server actions", () => {
  for (const kind of ["team-member", "assignment", "onboarding", "vendor", "task", "calendar-event"]) {
    assert.match(form, new RegExp(`kind === \\"${kind}\\"|\\"${kind}\\":`));
  }
  assert.match(form, /useActionState/);
  assert.match(form, /savePhaseFourRecordAction\.bind/);
  assert.doesNotMatch(form, /sessionStorage|setTimeout/);
});
