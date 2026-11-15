# Microsoft Teams meetings on the calendar: setup

UNISON can attach a Microsoft Teams meeting to a calendar event. Turn on **Online meeting** on the event form and UNISON asks Microsoft Graph for a meeting, stores the join link on the event (`calendar_events.teams_join_url`), makes it the event's location (the Location field is hidden while it is on), adds it to the description, and shows a **Join** button in the calendar (agenda and week/day blocks) and on the event page.

Until the steps below are done the calendar works as before and the form says **Teams not connected**. Nothing is faked: with no credentials, no meeting is created and the Online meeting switch is disabled.

## How sign-in relates to this

People sign in to UNISON with Microsoft through Supabase Auth (the Azure provider). That sign-in is **delegated** and Supabase does not keep the provider's access or refresh token, so UNISON cannot act as the signed-in person in Microsoft 365 later. Creating meetings therefore uses a separate **app-only** (client-credentials) connection: the same kind that already sends UNISON's mail (`lib/email/graph.ts`).

## Options that were weighed

| Option | Graph permission | Who the meeting belongs to | Verdict |
| --- | --- | --- | --- |
| **A. Calendar event with a Teams meeting, app-only (chosen)** | `Calendars.ReadWrite` (Application) | One organiser mailbox you choose | One permission on the app registration that already exists, one Exchange policy. Works with what an owner can realistically do in the Entra and Exchange admin centres. Each meeting also appears in that mailbox's calendar. |
| B. Online meeting, app-only | `OnlineMeetings.ReadWrite.All` (Application) | One organiser user | Cleaner (no calendar entry) but needs a Teams application access policy created with the Teams PowerShell module (`New-CsApplicationAccessPolicy`, `Grant-CsApplicationAccessPolicy`), which can take up to 30 minutes to apply. Possible later; only `lib/integrations/microsoft-teams.ts` would change. |
| C. Delegated, as the signed-in person | `Calendars.ReadWrite` (Delegated) | Each user | Needs each user's token kept and refreshed, which Supabase does not do. Rejected for now. |

## What the owner must do (option A)

These need a Microsoft 365 / Entra administrator and cannot be done from the code.

1. **Choose the organiser mailbox.** A licensed user mailbox that has Teams, for example `meetings@yourdomain`. Every UNISON Teams meeting is created in this mailbox's calendar and the meeting belongs to it. (A shared mailbox without a licence cannot host Teams meetings.)
2. **Use the existing app registration** that holds `Mail.Send` (the one in `GRAPH_CLIENT_ID`), or make a new one. In Entra admin centre → App registrations → *API permissions* → Add a permission → Microsoft Graph → **Application permissions** → add **`Calendars.ReadWrite`** → **Grant admin consent**.
3. **Limit that permission to the organiser mailbox.** `Calendars.ReadWrite` as granted reaches every mailbox in the tenant. Restrict it with an Exchange Online application access policy (the same control `docs/follow-ups.md` asks for on `Mail.Send`):

   ```powershell
   Connect-ExchangeOnline
   New-DistributionGroup -Name "UNISON Teams organiser" -Type Security -Members meetings@yourdomain
   New-ApplicationAccessPolicy -AppId <GRAPH_CLIENT_ID> -PolicyScopeGroupId <that group's address> -AccessRight RestrictAccess -Description "UNISON may only use the Teams organiser mailbox"
   Test-ApplicationAccessPolicy -AppId <GRAPH_CLIENT_ID> -Identity meetings@yourdomain
   ```
   If the same registration also sends mail, include the mail sender in the group so `Mail.Send` keeps working.
4. **Set the environment variables** on the deployment (and `.env.local` for local work). The first three are already set if mail works:

   | Variable | Value |
   | --- | --- |
   | `GRAPH_TENANT_ID` | Directory (tenant) ID |
   | `GRAPH_CLIENT_ID` | Application (client) ID |
   | `GRAPH_CLIENT_SECRET` | A current client secret (watch its expiry) |
   | `TEAMS_ORGANIZER_UPN` | The organiser mailbox's user principal name, e.g. `meetings@yourdomain` |

5. **Apply the database migration** `supabase/migrations/20261115100000_calendar_teams_meetings.sql` to the UNISON project (adds `teams_join_url` and `teams_event_id` to `calendar_events`). It is additive.
6. Redeploy. **Settings > Integrations > Microsoft Teams** then reads **Connected** and shows the organiser mailbox. Press **Test connection** there: it asks Microsoft for a token and reads the organiser's calendar (no meeting is created) and says plainly what is wrong if it fails.

## Behaviour and limits

- Meetings are created with no attendees. Share the join link (it is in the event's description and detail page).
- Editing an event that has a meeting updates the Teams event's title and time. Cancelling or archiving a UNISON event does not delete the Teams event yet.
- If Graph fails, the event is **not** saved and the form says why, so an event never claims a meeting it does not have. If the event cannot be saved after the meeting was made, the meeting is removed again.
- Times are Africa/Johannesburg (UTC+2) throughout.
- Secrets are read only from the environment, at the moment a meeting is requested. Nothing is committed.

## Troubleshooting

| What the form says | Cause | Fix |
| --- | --- | --- |
| "Microsoft Exchange is blocking the app (access policy)" | Graph answered 403 `ErrorAccessDenied` with "Blocked by tenant configured AppOnly AccessPolicy settings". The Exchange application access policy does not allow this app to use the organiser mailbox, or has not taken effect yet. | Check `Get-ApplicationAccessPolicy`, that the organiser mailbox is a member of the policy's group, and that no second policy (for example `DenyAccess`) names the same app. A new policy or group can take 30 minutes to a few hours to apply. `Test-ApplicationAccessPolicy` should report `Granted`. |
| "The Teams meeting could not be created" | Any other Graph failure (missing consent, expired secret, wrong mailbox). | The server log has Microsoft's own message (it is never shown in the form). |
