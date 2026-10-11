-- Pricing and credit model, part 1: the rate card and locked lines.
-- The rate card is rows in price_list_items marked with a rate_key. Only an owner or admin changes one, and never its identity;
-- a signed-in user cannot create one. Lines built from the rate card are locked (rate_locked): price, quantity, title and
-- description cannot be changed by a signed-in role, and a signed-in role cannot create a locked line (the builders in the
-- next migrations are definer functions). Append-only: earlier migrations are not edited.

-- ---------------------------------------------------------------------------
-- 1. Columns on the price list.
-- ---------------------------------------------------------------------------
alter table public.price_list_items
  add column rate_key text,
  add column item_kind text,
  add column package_key text,
  add column credits numeric(8,2),
  add column rate_status text,
  add column initiative_limit integer;

alter table public.price_list_items
  add constraint price_list_items_item_kind_check
    check (item_kind in ('retainer_monthly', 'retainer_implementation', 'retainer_top_up', 'project', 'project_top_up', 'support')),
  add constraint price_list_items_credits_check check (credits is null or credits > 0),
  add constraint price_list_items_rate_status_check check (rate_status in ('agreed', 'proposed')),
  add constraint price_list_items_limit_check check (initiative_limit is null or initiative_limit > 0),
  add constraint price_list_items_rate_shape check (
    (rate_key is null and item_kind is null and package_key is null and credits is null and rate_status is null and initiative_limit is null)
    or (rate_key is not null and item_kind is not null and rate_status is not null)
  ),
  add constraint price_list_items_limit_retainer_only check (initiative_limit is null or item_kind = 'retainer_monthly');

create unique index price_list_items_rate_key_unique on public.price_list_items(organization_id, rate_key) where rate_key is not null;
create index price_list_items_package_idx on public.price_list_items(organization_id, package_key, item_kind) where rate_key is not null;

-- ---------------------------------------------------------------------------
-- 2. Who may change a rate card item. Applies to the signed-in roles only; the migration, the definer functions and the
--    service role (fixtures) are not held to it.
-- ---------------------------------------------------------------------------
create or replace function public.price_list_items_rate_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rate_key is not null or new.item_kind is not null or new.package_key is not null or new.credits is not null
         or new.rate_status is not null or new.initiative_limit is not null then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    else
      if new.rate_key is distinct from old.rate_key or new.item_kind is distinct from old.item_kind
         or new.package_key is distinct from old.package_key or new.credits is distinct from old.credits
         or new.rate_status is distinct from old.rate_status then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
      if old.rate_key is not null then
        if not public.has_role(old.organization_id, array['owner', 'admin']) then
          raise exception 'RATE_CARD_ADMIN_ONLY' using errcode = '23514';
        end if;
      elsif new.initiative_limit is distinct from old.initiative_limit then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger price_list_items_rate_guard before insert or update on public.price_list_items
  for each row execute function public.price_list_items_rate_guard();
revoke all on function public.price_list_items_rate_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Locked lines.
-- ---------------------------------------------------------------------------
alter table public.quote_lines add column rate_locked boolean not null default false;
alter table public.invoice_lines add column rate_locked boolean not null default false;

create or replace function public.document_lines_rate_lock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rate_locked then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.rate_locked is distinct from old.rate_locked then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
      -- Position (moving a line) is free; the content of a locked line is not.
      if old.rate_locked and (
        new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.quantity is distinct from old.quantity
        or new.unit_price is distinct from old.unit_price
        or new.vat_code is distinct from old.vat_code
        or new.price_list_item_id is distinct from old.price_list_item_id
      ) then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger quote_lines_rate_lock before insert or update on public.quote_lines
  for each row execute function public.document_lines_rate_lock();
create trigger invoice_lines_rate_lock before insert or update on public.invoice_lines
  for each row execute function public.document_lines_rate_lock();
revoke all on function public.document_lines_rate_lock() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The seed. 28 rows, loaded for the HIMARK organisation only (other organisations and test fixtures get no rate card).
--    Rows are generated from features/billing/rate-card.ts; tests/unit/billing-rate-card.test.ts keeps the two equal.
-- ---------------------------------------------------------------------------
create or replace function private.seed_rate_card(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.price_list_items
    (organization_id, rate_key, item_kind, package_key, title, description, unit_price, credits, rate_status, initiative_limit, vat_code)
  select p_org, v.rate_key, v.item_kind, v.package_key, v.title, v.description, v.unit_price, v.credits, v.rate_status, v.initiative_limit, 'standard'
  from (values
    ('retainer.signature.monthly','retainer_monthly','signature','Signature Partner: monthly retainer','Includes 40 credits a month.',100000,40,'agreed',2),
    ('retainer.signature.implementation','retainer_implementation','signature','Signature Partner: one-time implementation','Charged once at activation. Includes 40 one-time implementation credits.',100000,40,'agreed',null),
    ('retainer.signature.top_up','retainer_top_up','signature','Signature Partner: top-up credits','Extra credits, charged per credit. Proposed rate, not yet agreed.',2500,null,'proposed',null),
    ('retainer.growth.monthly','retainer_monthly','growth','Growth Partner: monthly retainer','Includes 75 credits a month.',150000,75,'agreed',4),
    ('retainer.growth.implementation','retainer_implementation','growth','Growth Partner: one-time implementation','Charged once at activation. Includes 75 one-time implementation credits.',150000,75,'agreed',null),
    ('retainer.growth.top_up','retainer_top_up','growth','Growth Partner: top-up credits','Extra credits, charged per credit. Proposed rate, not yet agreed.',2000,null,'proposed',null),
    ('retainer.private.monthly','retainer_monthly','private','Private Partner: monthly retainer','Includes 120 credits a month.',200000,120,'agreed',6),
    ('retainer.private.implementation','retainer_implementation','private','Private Partner: one-time implementation','Charged once at activation. Includes 120 one-time implementation credits.',200000,120,'agreed',null),
    ('retainer.private.top_up','retainer_top_up','private','Private Partner: top-up credits','Extra credits, charged per credit. Proposed rate, not yet agreed.',1666.67,null,'proposed',null),
    ('retainer.reserve.monthly','retainer_monthly','reserve','HIMARK Reserve: monthly retainer','Includes 220 credits a month.',300000,220,'agreed',null),
    ('retainer.reserve.implementation','retainer_implementation','reserve','HIMARK Reserve: one-time implementation','Charged once at activation. Includes 220 one-time implementation credits.',300000,220,'agreed',null),
    ('retainer.reserve.top_up','retainer_top_up','reserve','HIMARK Reserve: top-up credits','Extra credits, charged per credit. Proposed rate, not yet agreed.',1363.64,null,'proposed',null),
    ('project.operating_model','project','operating_model','Operating Model & Operations Transformation: project','Fixed-scope project fee. Includes 40 implementation credits.',120000,40,'agreed',null),
    ('project.intelligence_ai','project','intelligence_ai','Intelligence & AI Transformation: project','Fixed-scope project fee. Includes 50 implementation credits.',150000,50,'agreed',null),
    ('project.digital_experience','project','digital_experience','Digital Experience: project','Fixed-scope project fee. Includes 22 implementation credits.',65000,22,'agreed',null),
    ('project.digital_presence','project','digital_presence','Digital Presence: project','Fixed-scope project fee. Includes 15 implementation credits.',45000,15,'agreed',null),
    ('project.visual_communication','project','visual_communication','Visual Communication & Operations: project','Fixed-scope project fee. Includes 12 implementation credits.',35000,12,'agreed',null),
    ('project.top_up','project_top_up',null,'Project top-up credits','Extra credits for an approved scope increase, charged per credit. Proposed rate, not yet agreed.',3000,null,'proposed',null),
    ('support.operations_improvement','support','operating_model','Operations Improvement Support: monthly','Includes 12 credits a month. Core monthly support.',35000,12,'agreed',null),
    ('support.ai_automation_care','support','intelligence_ai','AI & Automation Care: monthly','Includes 5 credits a month. Core monthly support.',15000,5,'agreed',null),
    ('support.digital_experience_management','support','digital_experience','Digital Experience Management: monthly','Includes 10 credits a month. Core monthly support.',30000,10,'agreed',null),
    ('support.application_interface_care','support','digital_experience','Application & Interface Care: monthly','Includes 3 credits a month. Optional monthly care.',10000,3,'agreed',null),
    ('support.digital_presence_management','support','digital_presence','Digital Presence Management: monthly','Includes 7 credits a month. Core monthly support.',20000,7,'agreed',null),
    ('support.website_care','support','digital_presence','Website Care: monthly','Includes 2 credits a month. Optional monthly care.',5000,2,'agreed',null),
    ('support.communication_asset_care','support','visual_communication','Communication & Asset Care: monthly','Includes 2 credits a month. Core monthly support.',5000,2,'agreed',null),
    ('support.podcast_content','support','visual_communication','Podcast Content: monthly','Includes 8 credits a month. Optional monthly content.',25000,8,'agreed',null),
    ('support.integrated_podcast_social','support','visual_communication','Integrated Podcast & Social Media Content: monthly','Includes 13 credits a month. An alternative to Podcast Content and Social Media Content.',40000,13,'agreed',null),
    ('support.social_media_content','support','visual_communication','Social Media Content: monthly','Includes 7 credits a month. Optional monthly content.',20000,7,'agreed',null)
  ) as v(rate_key, item_kind, package_key, title, description, unit_price, credits, rate_status, initiative_limit)
  on conflict (organization_id, rate_key) where rate_key is not null do nothing
$$;
revoke all on function private.seed_rate_card(uuid) from public, anon, authenticated;

select private.seed_rate_card(o.id) from public.organizations o where o.id = '00000000-0000-4000-8000-000000000001';
