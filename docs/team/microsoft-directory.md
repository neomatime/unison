# Team page: the HIMARK Microsoft 365 directory

The Team page lists everyone in the organisation's Microsoft 365 directory whose address is on the organisation's domain (`organizations.email_domain`), whether or not they have signed in to UNISON. A person in the directory who has no profile yet gets one the first time the page is opened. Guests, disabled accounts and addresses on other domains are left out. Nothing is deleted: profiles added by hand stay in `team_members` but are only listed if they are in the directory.

## One step for a Microsoft administrator

UNISON reads the directory with the app registration that already sends its mail (`GRAPH_CLIENT_ID`), app-only, read only.

1. Entra admin centre, App registrations, that app, API permissions, Add a permission, Microsoft Graph, **Application permissions**, **`User.Read.All`**, then **Grant admin consent**.
2. Nothing to redeploy. The token is cached up to an hour; the page picks the permission up after that, or after a redeploy.

`User.Read.All` reads basic profile data (name, address, job title, department) for every user in the tenant. It cannot read mail or files and cannot change anything.

## Until it is granted

The page falls back to people who have signed in with Microsoft and shows a line saying so. It never shows an empty list because of a missing permission.
