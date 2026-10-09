-- Commercial partner level (Signature / Growth / Private / HIMARK Reserve). Nullable
-- and additive: existing organisations stay unset until an internal administrator
-- chooses one. Prices are not stored; they come from config/partner-levels.ts.

alter table public.organizations
  add column partner_level text
  check (partner_level in ('signature', 'growth', 'private', 'reserve'));
