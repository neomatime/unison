-- Seeds every existing organization with the six frameworks the delivery
-- screens already reference by name, so projects can be created immediately.
-- Client Onboarding gets its own six stages: the mock onboardingStages list
-- differs from the eight delivery phases, which is the reason phases belong to
-- a framework rather than being global.
do $$
declare
  org record;
  fw_id uuid;
  fw record;
  phase_name text;
  idx integer;
begin
  for org in select id from public.organizations loop
    for fw in
      select * from (values
        ('Business / Technology Change', 'Enterprise',   'v3.2'),
        ('Automation Implementation',    'Technology',   'v2.4'),
        ('Client Onboarding',            'Operations',   'v4.1'),
        ('Regulatory Change',            'Compliance',   'v2.8'),
        ('Digital Transformation',       'Enterprise',   'v5.0'),
        ('Product Launch',               'Commercial',   'v1.9')
      ) as t(name, type, version)
    loop
      insert into public.frameworks (organization_id, name, type, version)
      values (org.id, fw.name, fw.type, fw.version)
      on conflict (organization_id, name) do nothing
      returning id into fw_id;

      if fw_id is null then
        continue;
      end if;

      idx := 1;
      foreach phase_name in array (
        case when fw.name = 'Client Onboarding'
          then array['Welcome','Company Setup','Information & Documentation','Agreements','Review & Approval','Go Live / Handover']
          else array['Initiate','Discover','Design','Build','Test','Ready','Deploy','Measure']
        end
      ) loop
        insert into public.framework_phases (framework_id, organization_id, name, position)
        values (fw_id, org.id, phase_name, idx);
        idx := idx + 1;
      end loop;

      fw_id := null;
    end loop;
  end loop;
end $$;
