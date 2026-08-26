-- Fixes a Critical finding from Task 2 review: bare `on delete set null` on a
-- composite foreign key nulls EVERY column in the key, not just the one that
-- pointed at the deleted row. That meant deleting a clients row attempted to
-- null projects.organization_id (NOT NULL), and deleting a framework_phases
-- row attempted to null projects.framework_id (NOT NULL) -- both aborted
-- with a not-null violation instead of degrading gracefully, the opposite of
-- what these constraints were meant to do. The column-scoped
-- `on delete set null (col)` syntax (PG15+) restricts the null-out to only
-- the named column, leaving organization_id / framework_id untouched.
alter table public.projects drop constraint projects_client_fkey;
alter table public.projects
  add constraint projects_client_fkey
  foreign key (client_id, organization_id)
  references public.clients (id, organization_id)
  on delete set null (client_id);

alter table public.projects drop constraint projects_phase_fkey;
alter table public.projects
  add constraint projects_phase_fkey
  foreign key (framework_id, phase_id)
  references public.framework_phases (framework_id, id)
  on delete set null (phase_id);
