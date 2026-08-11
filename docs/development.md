# Development

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm exec tsc --noEmit
pnpm build
```

Tenancy integration specifications can be run with Node 24's TypeScript stripping support. See `tests/integration/tenancy/` for the current test files.

The existing `pnpm lint` script requires ESLint, which is not currently installed or configured. No test runner exists yet.

## Conventions

- Keep route files thin and compose screens from `features/`.
- Keep business services with their owning feature.
- Put reusable interface primitives in `components/`.
- Put platform integrations in `lib/`.
- Enable a module in `config/modules.ts` only after its route works.
- Add tests under `tests/unit`, `tests/integration`, or `tests/e2e` once the relevant runner is configured.
