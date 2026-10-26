-- Accept to invoice, stage 1, task 7: the start date and term of a quote reach the client's page. Append-only: the applied
-- migrations are not edited; the one function below is replaced with the same signature and its security, search path, time
-- zone and grants stated again.
--
-- private.quote_snapshot (newest: 20261018102500_quote_portal_read_fixes.sql, section 1) is the body of that migration unchanged,
-- except that the record gains start_date and term_months ONLY when the quote has a start date (the table check
-- quotes_billing_terms_check makes the term present with it). A quote without terms therefore yields exactly the jsonb it yields
-- today, key for key, so its snapshot hash is the hash it has today; a quote with terms yields two more keys, and a different hash,
-- because the terms are part of what the client sees and accepts.
--
-- Nothing else is edited: portal_get_quote passes the record through as it is, private.quote_snapshot_hash hashes whatever the
-- snapshot returns, and portal_decide recomputes that same hash. The grants are those the function has: the service role only.

create or replace function private.quote_snapshot(p_quote_id uuid) returns jsonb
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'record', jsonb_build_object(
      'quote_number', q.quote_number,
      'status', q.status,
      'issue_date', q.issue_date,
      'valid_until', q.valid_until,
      'currency', q.currency,
      'client_name', q.client_name,
      'contact_name', q.contact_name,
      'client_ref', q.client_ref,
      'project_name', q.project_name,
      'project_description', q.project_description,
      'project_ref', q.project_ref,
      'vat_rate', q.vat_rate,
      'subtotal', q.subtotal,
      'tax_amount', q.tax_amount,
      'total_amount', q.total_amount,
      'terms', q.terms,
      'service_inclusions', q.service_inclusions,
      'terms_sources', case when q.terms_sources is null then null else (
        select coalesce(jsonb_agg(jsonb_build_object('layer', s.value -> 'layer', 'version', s.value -> 'version') order by s.ordinality), '[]'::jsonb)
        from jsonb_array_elements(q.terms_sources) with ordinality as s(value, ordinality)) end,
      'bill_to', q.bill_to,
      'issuer', q.issuer,
      'sent_at', q.sent_at,
      'accepted_at', q.accepted_at)
      || case when q.start_date is not null then jsonb_build_object('start_date', q.start_date, 'term_months', q.term_months) else '{}'::jsonb end,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'position', l.position,
        'title', l.title,
        'description', l.description,
        'quantity', l.quantity,
        'unit_price', l.unit_price,
        'vat_code', l.vat_code,
        'line_amount', l.line_amount,
        'charge_kind', l.charge_kind) order by l.position, l.id)
      from public.quote_lines l
      where l.quote_id = q.id and l.organization_id = q.organization_id), '[]'::jsonb))
  from public.quotes q
  where q.id = p_quote_id
$$;

revoke all on function private.quote_snapshot(uuid) from public, anon, authenticated;
grant execute on function private.quote_snapshot(uuid) to service_role;
