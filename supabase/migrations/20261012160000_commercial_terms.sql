-- Commercial terms foundation (build 1 of the terms engine). Append-only.
-- Terms templates are written only through the functions below. An approved version can never be edited: Build 2 points a
-- document at a version and relies on the wording behind it not moving. Owners and admins write, approve, archive and
-- restore; members read approved and archived versions only (never drafts).

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------
create table public.terms_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_kind text not null check (target_kind in ('company', 'retainer', 'project', 'support')),
  target_key text check (target_key is null or target_key ~ '^[a-z0-9_]{1,60}$'),
  applies_to text not null check (applies_to in ('quote', 'invoice', 'both')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint terms_templates_key_matches_kind check ((target_kind = 'company') = (target_key is null))
);

create unique index terms_templates_target_unique
  on public.terms_templates (organization_id, target_kind, coalesce(target_key, ''), applies_to);

create table public.terms_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null,
  version integer not null check (version >= 1),
  status text not null check (status in ('draft', 'approved', 'archived')),
  body text not null default '' check (char_length(body) <= 20000),
  inclusions text not null default '' check (char_length(inclusions) <= 10000),
  effective_from date,
  change_note text check (change_note is null or char_length(change_note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  unique (template_id, version),
  constraint terms_versions_template_fkey foreign key (template_id, organization_id)
    references public.terms_templates(id, organization_id) on delete cascade,
  constraint terms_versions_approved_complete check (status = 'draft' or (effective_from is not null and approved_at is not null)),
  constraint terms_versions_archived_time check ((status = 'archived') = (archived_at is not null))
);

-- One draft per template: saving a draft updates it in place.
create unique index terms_versions_one_draft on public.terms_template_versions (template_id) where status = 'draft';
create index terms_versions_org_idx on public.terms_template_versions (organization_id, template_id, status);

create trigger terms_templates_set_updated_at before update on public.terms_templates
  for each row execute function public.set_updated_at();
create trigger terms_template_versions_set_updated_at before update on public.terms_template_versions
  for each row execute function public.set_updated_at();
create trigger terms_templates_audit after insert or update or delete on public.terms_templates
  for each row execute function public.record_audit_event();
create trigger terms_template_versions_audit after insert or update or delete on public.terms_template_versions
  for each row execute function public.record_audit_event();

-- ---------------------------------------------------------------------------
-- 2. Row-level security: members read; nobody writes directly.
-- ---------------------------------------------------------------------------
alter table public.terms_templates enable row level security;
alter table public.terms_template_versions enable row level security;

create policy terms_templates_select on public.terms_templates
  for select to authenticated using (public.is_member_of(organization_id));
create policy terms_versions_select on public.terms_template_versions
  for select to authenticated
  using (public.is_member_of(organization_id) and (status <> 'draft' or public.has_role(organization_id, array['owner', 'admin'])));

revoke all on public.terms_templates, public.terms_template_versions from anon, authenticated;
grant select on public.terms_templates, public.terms_template_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. An approved or archived version cannot change (every role, including the functions below). The only permitted
--    changes are approved to archived, and a user reference being set to null when that user is deleted.
-- ---------------------------------------------------------------------------
create or replace function public.terms_versions_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.status = 'draft' then
    if new.status = 'archived' then
      raise exception 'TERMS_VERSION_IMMUTABLE' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.template_id is distinct from old.template_id
     or new.version is distinct from old.version
     or new.body is distinct from old.body
     or new.inclusions is distinct from old.inclusions
     or new.effective_from is distinct from old.effective_from
     or new.change_note is distinct from old.change_note
     or new.created_at is distinct from old.created_at
     or new.approved_at is distinct from old.approved_at
     or (new.created_by is distinct from old.created_by and new.created_by is not null)
     or (new.approved_by is distinct from old.approved_by and new.approved_by is not null) then
    raise exception 'TERMS_VERSION_IMMUTABLE' using errcode = '23514';
  end if;
  if new.status is distinct from old.status or new.archived_at is distinct from old.archived_at then
    if not (old.status = 'approved' and new.status = 'archived') then
      raise exception 'TERMS_VERSION_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.terms_versions_guard() from public, anon, authenticated;

create trigger terms_versions_guard before update on public.terms_template_versions
  for each row execute function public.terms_versions_guard();

-- ---------------------------------------------------------------------------
-- 4. Helpers (private schema, not callable by signed-in roles).
-- ---------------------------------------------------------------------------
-- True when every {{...}} in the text is exactly one of the five placeholders. Keep the list equal to
-- features/terms/placeholders.ts (tests/unit/terms-seed.test.ts checks it).
create or replace function private.terms_text_valid(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select position('{{' in rest) = 0 and position('}}' in rest) = 0
  from (
    select regexp_replace(coalesce(p_text, ''), '\{\{(monthly_fee|monthly_credits|initiative_limit|valid_days|payment_days)\}\}', '', 'g') as rest
  ) as s
$$;

-- A member of the organisation, and an owner or admin of it; otherwise the caller learns nothing about the organisation.
create or replace function private.terms_admin(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_org is null or not public.is_member_of(p_org) then
    raise exception 'TERMS_NOT_FOUND' using errcode = '42501';
  end if;
  if not public.has_role(p_org, array['owner', 'admin']) then
    raise exception 'TERMS_FORBIDDEN' using errcode = '42501';
  end if;
end $$;

revoke all on function private.terms_text_valid(text) from public, anon, authenticated;
revoke all on function private.terms_admin(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The functions the app calls.
-- ---------------------------------------------------------------------------
create or replace function public.create_terms_template(p_org uuid, p_target_kind text, p_target_key text, p_applies_to text, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_target_key, '')), '');
  v_title text := btrim(coalesce(p_title, ''));
begin
  perform private.terms_admin(p_org);
  if coalesce(p_target_kind, '') not in ('company', 'retainer', 'project', 'support')
     or coalesce(p_applies_to, '') not in ('quote', 'invoice', 'both')
     or (p_target_kind = 'company') <> (v_key is null)
     or (v_key is not null and v_key !~ '^[a-z0-9_]{1,60}$')
     or char_length(v_title) not between 1 and 200 then
    raise exception 'TERMS_TARGET_INVALID' using errcode = '22023';
  end if;
  insert into public.terms_templates (organization_id, target_kind, target_key, applies_to, title)
  values (p_org, p_target_kind, v_key, p_applies_to, v_title)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'TERMS_TEMPLATE_EXISTS' using errcode = '23505';
end $$;

create or replace function public.save_terms_draft(p_template uuid, p_body text, p_inclusions text, p_effective_from date, p_change_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
  v_next integer;
  v_body text := replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_inc text := replace(replace(coalesce(p_inclusions, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_note text := nullif(btrim(coalesce(p_change_note, '')), '');
begin
  select t.organization_id into v_org from public.terms_templates t where t.id = p_template;
  perform private.terms_admin(v_org);
  if char_length(v_body) > 20000 or char_length(v_inc) > 10000 or char_length(coalesce(v_note, '')) > 500 then
    raise exception 'TERMS_TOO_LONG' using errcode = '22001';
  end if;
  -- Serialise version numbering for this template.
  perform 1 from public.terms_templates t where t.id = p_template for update;
  select v.id into v_id from public.terms_template_versions v where v.template_id = p_template and v.status = 'draft';
  if v_id is not null then
    update public.terms_template_versions
       set body = v_body, inclusions = v_inc, effective_from = p_effective_from, change_note = v_note
     where id = v_id;
  else
    -- A discarded draft's number is reused by the next draft; that is safe because drafts are never referenced.
    select coalesce(max(v.version), 0) + 1 into v_next from public.terms_template_versions v where v.template_id = p_template;
    insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, created_by)
    values (v_org, p_template, v_next, 'draft', v_body, v_inc, p_effective_from, v_note, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.discard_terms_draft(p_template uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_deleted integer;
begin
  select t.organization_id into v_org from public.terms_templates t where t.id = p_template;
  perform private.terms_admin(v_org);
  -- Lock the template first (the order save_terms_draft and restore_terms_version use), so a save cannot interleave.
  perform 1 from public.terms_templates t where t.id = p_template for update;
  delete from public.terms_template_versions v where v.template_id = p_template and v.status = 'draft';
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'TERMS_NOT_DRAFT' using errcode = '23514';
  end if;
end $$;

create or replace function public.approve_terms_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.terms_template_versions%rowtype;
begin
  select * into v_row from public.terms_template_versions v where v.id = p_version;
  perform private.terms_admin(v_row.organization_id);
  -- Lock the template first (the order save_terms_draft and restore_terms_version use), then the version.
  perform 1 from public.terms_templates t where t.id = v_row.template_id for update;
  select * into v_row from public.terms_template_versions v where v.id = p_version for update;
  if not found then
    raise exception 'TERMS_NOT_FOUND' using errcode = '42501';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'TERMS_NOT_DRAFT' using errcode = '23514';
  end if;
  if btrim(v_row.body) = '' then
    raise exception 'TERMS_EMPTY' using errcode = '23514';
  end if;
  if v_row.effective_from is null then
    raise exception 'TERMS_EFFECTIVE_REQUIRED' using errcode = '23514';
  end if;
  if not private.terms_text_valid(v_row.body) or not private.terms_text_valid(v_row.inclusions) then
    raise exception 'TERMS_PLACEHOLDER_UNKNOWN' using errcode = '23514';
  end if;
  update public.terms_template_versions
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_version;
end $$;

create or replace function public.archive_terms_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.terms_template_versions%rowtype;
begin
  select * into v_row from public.terms_template_versions v where v.id = p_version;
  perform private.terms_admin(v_row.organization_id);
  select * into v_row from public.terms_template_versions v where v.id = p_version for update;
  if not found then
    raise exception 'TERMS_NOT_FOUND' using errcode = '42501';
  end if;
  if v_row.status <> 'approved' then
    raise exception 'TERMS_NOT_APPROVED' using errcode = '23514';
  end if;
  update public.terms_template_versions set status = 'archived', archived_at = now() where id = p_version;
end $$;

create or replace function public.restore_terms_version(p_version uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.terms_template_versions%rowtype;
  v_next integer;
  v_id uuid;
begin
  select * into v_row from public.terms_template_versions v where v.id = p_version;
  perform private.terms_admin(v_row.organization_id);
  if v_row.status not in ('approved', 'archived') then
    raise exception 'TERMS_NOT_APPROVED' using errcode = '23514';
  end if;
  perform 1 from public.terms_templates t where t.id = v_row.template_id for update;
  if exists (select 1 from public.terms_template_versions v where v.template_id = v_row.template_id and v.status = 'draft') then
    raise exception 'TERMS_DRAFT_EXISTS' using errcode = '23514';
  end if;
  -- A discarded draft's number is reused by the next draft; that is safe because drafts are never referenced.
  select coalesce(max(v.version), 0) + 1 into v_next from public.terms_template_versions v where v.template_id = v_row.template_id;
  insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, created_by)
  values (v_row.organization_id, v_row.template_id, v_next, 'draft', v_row.body, v_row.inclusions, null, 'Restored from version ' || v_row.version, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.create_terms_template(uuid, text, text, text, text) from public, anon;
revoke all on function public.save_terms_draft(uuid, text, text, date, text) from public, anon;
revoke all on function public.discard_terms_draft(uuid) from public, anon;
revoke all on function public.approve_terms_version(uuid) from public, anon;
revoke all on function public.archive_terms_version(uuid) from public, anon;
revoke all on function public.restore_terms_version(uuid) from public, anon;
grant execute on function public.create_terms_template(uuid, text, text, text, text) to authenticated;
grant execute on function public.save_terms_draft(uuid, text, text, date, text) to authenticated;
grant execute on function public.discard_terms_draft(uuid) to authenticated;
grant execute on function public.approve_terms_version(uuid) to authenticated;
grant execute on function public.archive_terms_version(uuid) to authenticated;
grant execute on function public.restore_terms_version(uuid) to authenticated;
