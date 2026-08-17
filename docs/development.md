# Development

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm exec tsc --noEmit
pnpm build
pnpm test
pnpm test:rls
pnpm grant-owner <email>
```

- `pnpm test` runs `tests/integration/tenancy/*.test.ts` and `tests/unit/*.test.ts` with Node's built-in test runner and `--experimental-strip-types`. It is offline and credential-free — no `.env.local` needed.
- `pnpm test:rls` runs `tests/integration/rls/*.test.ts` against the **live** Supabase project. It requires `.env.local` (`--env-file=.env.local`) populated from `.env.local.example`, including `SUPABASE_SECRET_KEY`. These specs create and tear down real rows, so treat them as integration tests against a real backend, not a mock.
- `pnpm grant-owner <email>` grants the first HIMARK owner membership to an existing, email-verified account. It refuses unverified accounts (email_confirmed_at must be set) and refuses to touch an existing membership that already differs from an active owner — that has to go through the normal owner-only role-change path instead.

The existing `pnpm lint` script requires ESLint, which is not currently installed or configured.

## Conventions

- Keep route files thin and compose screens from `features/`.
- Keep business services with their owning feature.
- Put reusable interface primitives in `components/`.
- Put platform integrations in `lib/`.
- Enable a module in `config/modules.ts` only after its route works.
- Add tests under `tests/unit` or `tests/integration` — both run via `pnpm test` (or `pnpm test:rls` for the live-database RLS specs). `tests/e2e` remains reserved until an end-to-end runner is configured.
