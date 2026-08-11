# Database

UNISON does not currently connect to a database. The reserved persistence structure is:

- `database/migrations/` for ordered schema changes
- `database/seeds/` for development and test fixtures
- `database/policies/` for row-level and access policies
- `database/functions/` for database functions and triggers

Do not create application behavior that assumes these assets exist. If Supabase is introduced, its CLI-required `supabase/` structure takes precedence over duplicating migrations under `database/`.

