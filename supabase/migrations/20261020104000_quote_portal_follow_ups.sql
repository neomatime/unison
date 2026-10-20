-- Quote portal, slice 2: what follows a decision. private.decision_follow_ups (a no-op in 20261020103000_quote_portal_decide.sql)
-- gets its body: the quote's owner and the member who sent the link are told in the app, and a decline leaves a recovery
-- task for the owner (a note instead when the client chose another provider). private.decision_recipients is replaced so
-- that archived team members are passed over. portal_decide is unchanged.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. private.decision_recipients: archived profiles are ignored; one row for any quote id.
-- 2. private.decision_follow_ups: the notices and the decline recovery, each in a block whose failure only warns.

-- ---------------------------------------------------------------------------
-- 1. private.decision_recipients. Same signature and columns as before; one row for any quote id (nulls when nothing
--    resolves). A team profile with archived_at set counts as absent:
--      owner_*  the quote's owner when that profile is not archived, else all null. owner_user_id is null for a profile
--               with no login: such an owner has an email but no in-app notice.
--      sender_* the member who made the link: sender_member_id and sender_email from that login's earliest unarchived
--               team profile in the organisation. sender_user_id is the link's created_by (null once that membership is
--               gone), and null too when that login's only profiles here are archived: an archived member is not told.
--               A login with no team profile at all keeps sender_user_id, with no member and no email.
--      notify_email the unarchived owner's email, else the unarchived sender's, else null.
--    Invoker, as before: it is reached only from the definer functions and is never granted.
-- ---------------------------------------------------------------------------
create or replace function private.decision_recipients(p_quote_id uuid, p_link_id uuid)
returns table (
  owner_member_id uuid, owner_user_id uuid, owner_name text, owner_email text,
  sender_member_id uuid, sender_user_id uuid, sender_email text, notify_email text)
language sql stable security invoker set search_path = '' as $$
  select o.id, o.user_id, o.full_name, o.email,
         s.id,
         case when s.id is not null
                   or not exists (select 1 from public.team_members a
                                   where a.organization_id = q.organization_id and a.user_id = l.created_by)
              then l.created_by end,
         s.email,
         coalesce(o.email, s.email)
  from (select p_quote_id as quote_id) k
  left join public.quotes q on q.id = k.quote_id
  left join public.team_members o
    on o.id = q.owner_id and o.organization_id = q.organization_id and o.archived_at is null
  left join public.quote_access_links l on l.id = p_link_id and l.quote_id = q.id and l.organization_id = q.organization_id
  left join lateral (
    select t.id, t.email
    from public.team_members t
    where t.organization_id = q.organization_id and t.user_id = l.created_by and t.archived_at is null
    order by t.created_at, t.id
    limit 1) s on true
$$;

revoke all on function private.decision_recipients(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. private.decision_follow_ups: called by portal_decide after the status change, inside the decision's transaction,
--    once per recorded response (a replay records nothing and calls nothing). Each group below runs in its own block
--    whose handler only raises a warning naming the response and the error code (never the signatory's text), so a
--    follow-up that cannot be written never undoes the decision.
--      Notices: one notifications row each for the owner's login and the sender's login, once when they are the same
--        user; category Commercial, linking to the quote. Title "<client> accepted quotation <number>" (or declined);
--        body "Signed by <name>, <position>." for an accept, "<name>, <position>. Reason: <reason or none given>." for a
--        decline.
--      Decline recovery (declines only): the recommended action for the reason, then "Reason given: <reason>." and the
--        client's comments as given. "Chose another provider" leaves a note (no task) on the quote's opportunity, else
--        its client, else the quote. Every other reason, and none, leaves a task: "Follow up: <client> declined
--        quotation <number>", attached to the opportunity, else the client, else nothing; assigned to the owner's team
--        profile, else the sender's, else nobody; Medium, Planned, due three days from the decision.
--    The opportunity, its stage and the client are not touched; nothing is sent to the client. Definer, never granted.
-- ---------------------------------------------------------------------------
create or replace function private.decision_follow_ups(p_response_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_response public.quote_responses%rowtype;
  v_quote public.quotes%rowtype;
  v_to record;
  v_text text;
begin
  -- What was decided, on which quote, and who is told.
  begin
    select * into strict v_response from public.quote_responses r where r.id = p_response_id;
    select * into strict v_quote from public.quotes q
     where q.id = v_response.quote_id and q.organization_id = v_response.organization_id;
    select * into strict v_to from private.decision_recipients(v_quote.id, v_response.link_id);
  exception when others then
    raise warning 'decision_follow_ups: response % could not be read (SQLSTATE %)', p_response_id, sqlstate;
    return;
  end;

  -- The notices.
  begin
    insert into public.notifications (organization_id, user_id, title, body, category, href)
    select v_response.organization_id, u.user_id,
           v_quote.client_name || case v_response.decision when 'accepted' then ' accepted' else ' declined' end
             || ' quotation ' || v_quote.quote_number,
           case v_response.decision
             when 'accepted' then 'Signed by ' || v_response.signatory_name || ', ' || v_response.signatory_position || '.'
             else v_response.signatory_name || ', ' || v_response.signatory_position
                  || '. Reason: ' || coalesce(v_response.decline_reason, 'none given') || '.'
           end,
           'Commercial', '/commercial/quotes/' || v_quote.id
    from (select distinct x.user_id
          from unnest(array[v_to.owner_user_id, v_to.sender_user_id]) as x(user_id)
          where x.user_id is not null) u;
  exception when others then
    raise warning 'decision_follow_ups: the notices for response % were not written (SQLSTATE %)', p_response_id, sqlstate;
  end;

  -- The decline recovery.
  if v_response.decision = 'declined' then
    begin
      v_text := case v_response.decline_reason
          when 'Budget considerations' then
            'Review whether a smaller, clearly scoped engagement could meet their most important need. Do not discount automatically.'
          when 'Timing is not right' then 'Offer to reconnect on a date the client chooses.'
          when 'Scope does not meet our requirements' then
            'Offer a discovery conversation and a revised quotation if the need can be met.'
          when 'Internal approval pending' then
            'Offer a concise business case, supporting documents or an executive conversation.'
          when 'Chose another provider' then 'Thank them and close the opportunity respectfully, no repeated contact.'
          else 'One courteous, optional follow-up if it suits the relationship.'
        end
        || E'\n\nReason given: ' || coalesce(v_response.decline_reason, 'none given') || '.'
        || coalesce(E'\n\nClient''s comments:\n' || v_response.decline_comments, '');

      if v_response.decline_reason = 'Chose another provider' then
        insert into public.activities (organization_id, kind, subject, body, details, opportunity_id, client_id, quote_id)
        values (
          v_response.organization_id, 'note',
          v_quote.client_name || ' declined quotation ' || v_quote.quote_number, v_text,
          jsonb_build_object('quote_id', v_quote.id, 'response_id', v_response.id),
          v_quote.opportunity_id,
          case when v_quote.opportunity_id is null then v_quote.client_id end,
          case when v_quote.opportunity_id is null and v_quote.client_id is null then v_quote.id end);
      else
        insert into public.tasks (
          organization_id, title, description, opportunity_id, client_id, assignee_id, priority, status, due_at)
        values (
          v_response.organization_id,
          'Follow up: ' || v_quote.client_name || ' declined quotation ' || v_quote.quote_number, v_text,
          v_quote.opportunity_id,
          case when v_quote.opportunity_id is null then v_quote.client_id end,
          coalesce(v_to.owner_member_id, v_to.sender_member_id),
          'Medium', 'Planned', now() + interval '3 days');
      end if;
    exception when others then
      raise warning 'decision_follow_ups: the decline recovery for response % was not written (SQLSTATE %)', p_response_id, sqlstate;
    end;
  end if;
end $$;

revoke all on function private.decision_follow_ups(uuid) from public, anon, authenticated;
