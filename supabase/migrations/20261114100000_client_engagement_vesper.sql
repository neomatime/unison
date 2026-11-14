-- A client's primary engagement can also include Vesper, alone or with a monthly retainer and/or a standalone project.
-- Additive: the two existing values stay valid, so no row changes.

alter table public.clients drop constraint clients_engagement_type_check;
alter table public.clients add constraint clients_engagement_type_check
  check (engagement_type in ('Retainer', 'Project', 'Vesper', 'Vesper + Retainer', 'Vesper + Project', 'Vesper + Retainer + Project'));
