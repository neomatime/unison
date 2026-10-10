# The daily CRM loop

**Date:** 2026-10-10
**Status:** Awaiting review
**Origin:** Stage 1 of `docs/crm-roadmap.md`. The CRM modules are separate islands: a lead, opportunity or
quote page is a flat list of fields with one "Edit record" button, the client page holds only Documents, and
nothing connects a lead to the client it becomes.

## Intent

A salesperson's day is: a lead arrives (website form or typed in), gets qualified, becomes a client with an
opportunity, then the team keeps in touch, schedules follow-ups and moves the deal through its stages.
Success is that this whole loop can be done from the record pages, with the history of it in one place.

What the user decided in design:

- Contacts, a timeline and follow-ups live **on each record's own page** (lead, opportunity, client).
- Converting a lead creates **a client, a primary contact and an opportunity** in one step.
- If the company already exists as a client, conversion **offers to use it**.
- The timeline holds **logged activity plus key system events**.

## Scope

**In:** contacts, activity timeline, lead conversion, follow-ups from records, quick opportunity stage
change, and the tests, preview check and roadmap ticks for them.

**Out, and why:**

- **Email or inbox sync.** Emails are logged by hand. Syncing a mailbox is its own integration.
- **Reminder emails and notifications.** Roadmap Stage 4; follow-ups already appear in My Tasks.
- **CRM roles and "my records only".** Roadmap Stage 4. Every active member can use everything here.
- **Merging duplicate clients or contacts, contact import, lead assignment rules, global search over
  contacts.** None is needed for the loop to work.

## Data

All new keys include `organization_id`, so a row can never point at another organisation's record. This is the
pattern the rest of the schema uses.

### `contacts` (new)

A person at a client or at a lead. Fields: `full_name` (required), `email`, `phone`, `job_title`, `notes`,
`is_primary`, `archived_at`, `created_at`, `updated_at`.

- **Exactly one parent:** a check requires `(client_id is null) <> (lead_id is null)`. Both are composite foreign
  keys `(client_id, organization_id)` and `(lead_id, organization_id)`, `on delete cascade`.
- **At most one primary contact per parent**, counting only non-archived contacts, by two partial unique indexes.
- Removing a contact sets `archived_at`; it is not a hard delete.
- Carries the audit trigger and `set_updated_at`.

### `activities` (new)

One entry on a record's timeline.

- `kind`: the logged kinds `call`, `meeting`, `email`, `note`, and the system kinds `lead.converted`,
  `client.created_from_lead`, `opportunity.created_from_lead`, `opportunity.stage_changed`, `quote.sent`,
  `quote.accepted`. A check keeps `kind` inside this list.
- `subject` (required), `body`, `occurred_at` (when it happened; a logged entry may not be in the future),
  `details jsonb` (for example `{"from":"Qualified","to":"Proposal"}` on a stage change), `created_at`.
- `created_by`: a composite foreign key `(organization_id, created_by)` to `memberships`, `on delete set null
  (created_by)`. Unlike `tasks.created_by`, it is tenant-constrained.
- **Exactly one parent** among `lead_id`, `client_id`, `opportunity_id`, `quote_id` (`num_nonnulls(...) = 1`),
  each a composite foreign key, `on delete cascade`. A system event that concerns three records is written as
  three rows, one per record.
- **Access:** members read all of an organisation's activities. A member inserts only a **logged** kind, and only
  with `created_by = auth.uid()` (so authorship cannot be forged). A member updates or deletes only a **logged**
  entry they wrote; an owner or admin may edit or delete any logged entry. System entries have no update or
  delete policy at all, so nobody can change them.
- System entries are written by a `security definer` function `record_activity(...)` that the database triggers
  call; `EXECUTE` on it is revoked from `public`, `anon` and `authenticated`.
- Audit trigger on update and delete only (inserts are the log itself).

### Changes to existing tables

- **`tasks`**: add `lead_id` and `opportunity_id`, composite foreign keys `on delete set null (col)`. `client_id`
  already exists.
- **`leads`**: add `converted_at`, `converted_client_id`, `converted_opportunity_id` (composite foreign keys, `on
  delete set null`). A check `(status = 'Converted') = (converted_at is not null)` means a lead is Converted only
  through conversion. The edit form stops offering Converted.
- **`sales_opportunities`**: a check `stage <> 'Lost' or lost_reason is not null`. The edit form requires the
  reason when Lost is chosen.

Production holds no CRM rows, so these checks apply cleanly. Existing records are untouched.

## Behaviour

### Converting a lead

A button on the lead page opens a real page, `/commercial/leads/[leadId]/convert`, which shows what will be
created and, if a non-archived client with the same company name exists (compared ignoring capitals and extra
spaces), offers "add to <client>" or "create a separate client". Submitting calls the database function
`convert_lead(p_lead_id uuid, p_client_id uuid default null) returns jsonb`, `security invoker`, one transaction:

1. Refuses a caller who is not a member (42501), a lead that is archived, already converted, or not in the
   caller's organisation, and a `p_client_id` that is archived or in another organisation.
2. **Client:** with `p_client_id`, uses it. Otherwise creates one from the lead: `name` = company name,
   `industry`, `contact_name`, `contact_email`, `contact_phone`, status `Onboarding`, and `engagement_type` only
   when the lead's value is exactly `Retainer` or `Project`.
3. **Contact:** reuses a non-archived contact on that client with the same email (compared case-insensitively),
   otherwise creates one from the lead's contact name, email, phone and role. It is primary when the client has
   no primary contact, otherwise not. Contacts and follow-ups already attached to the lead move to the client
   (`tasks.client_id` is set; the task keeps its `lead_id`).
4. **Opportunity:** at `Discovery`, named after the company, with the lead's `owner_id`, `estimated_value`,
   `currency` and `notes`, linked to the client and the lead.
5. **Lead:** `status = 'Converted'`, `converted_at`, `converted_client_id`, `converted_opportunity_id`.
6. Writes `lead.converted`, `client.created_from_lead` (only when a client was created) and
   `opportunity.created_from_lead` entries, one on each record.
7. Returns the three ids; the page redirects to the opportunity.

Any failure rolls the whole thing back.

### Timeline

- A "Log activity" form on lead, opportunity and client pages (kind, subject, notes, date and time, default now).
- **System entries** come from triggers: `opportunity.stage_changed` on any change of `sales_opportunities.stage`
  (however it was made), and `quote.sent` / `quote.accepted` when `sent_at` / `accepted_at` are first set
  (including on insert). Conversion writes its own, above.
- **What each page shows** (newest first, 20 at a time with "Load more"): a lead its own entries; an opportunity
  its own plus those of quotes linked to it; a client its own plus those of leads converted to it and of its
  opportunities and quotes. One function, `record_timeline(p_kind text, p_id uuid, p_limit int, p_before
  timestamptz)`, `security invoker`, does this so the page makes one call.

### Follow-ups

Reuse `tasks`. "Add follow-up" on lead, opportunity and client pages: title, due date and time, assignee, priority
(default Medium). The assignee defaults to the signed-in user's team profile when they have one, otherwise it is
left unassigned. A follow-up created on an opportunity also gets its `client_id` when it has one. "Mark done"
sets `status = 'Complete'` and `completed_at`; it can be reopened. Open follow-ups sort soonest first, overdue
ones are flagged, completed ones are collapsed. They already appear in My Tasks on the dashboard.

### Quick stage change

The opportunity page header gets a Stage control that saves on change. Choosing Lost first asks for a reason.
Won stamps the win date through the existing trigger. The timeline entry comes from the stage trigger, so the
edit form produces it too.

## Screens

- Shared sections in a new `features/crm-workspace/`: Contacts, Timeline (with the log form), Follow-ups. They
  sit under the existing field list on the lead and opportunity pages and on the client page. The quote page
  gets the Timeline only.
- An opportunity shows its client's contacts, or its lead's when it has no client yet. Adding a contact there adds
  it to that parent.
- Server actions validate input with pure readers (relative imports, so unit tests can run them), scope every
  write by `organization_id`, read the row back to tell "matched nothing" from success, and revalidate the
  record's page from the id the database returns.

## Errors

Plain messages naming the problem ("This lead has already been converted", "That client no longer exists",
"Choose a call, meeting, email or note"). A record from another organisation is refused by the database and
reported as not found. Nothing falls back to a default when a read fails.

## Testing

- **Database (RLS suite, fixture organisations, cleaned up including audit events):** isolation and
  wrong-organisation links refused for `contacts`, `activities` and the new task and lead columns; the
  parent-exactly-one and one-primary rules; authorship cannot be forged; edit and delete limited to the author or
  an owner or admin; system entries immutable; triggers write the right entries; `convert_lead` for a new client,
  an existing client, contact reuse, rollback when a later step fails, double conversion refused, a client in
  another organisation refused, a non-member refused; the Converted and Lost checks; `record_timeline` for each
  page kind; `anon` has no access.
- **Unit:** the form readers; a drift test keeping the activity kinds in the code equal to the database check;
  source guards for the server and client boundary and for no fixture data.
- **Cleanup sweep:** add `contacts` and `activities` to `tests/integration/rls/helpers.ts`.
- **Preview:** render the three sections and the Convert page with fixture data in a throwaway route and look at
  them at desktop, tablet and mobile widths, then delete it.
- **Not covered by anything automated:** a signed-in session against real records, which stays with the user.

## Order of work

1. Database foundation: tables, columns, checks, triggers, policies, and their tests.
2. `convert_lead` and the Convert page.
3. The Contacts, Timeline and Follow-ups sections on the record pages.
4. The quick stage change, and the Lost-reason requirement in the edit form.
5. Preview check, follow-ups doc, and ticking the boxes in `docs/crm-roadmap.md`.

## Global constraints

- `unison-uat` is production. Every test row is deleted, with its audit events. Rolled-back probes before
  applying any migration.
- Migrations are append-only; this slice adds one (or two if a review finds a hole).
- A control in the UI is a claim the product supports it. No role-based behaviour is invented.
- Secrets live in `.env.local` only.
- Never `git add -A`; stage explicit paths. Commit and push only when the user asks.
