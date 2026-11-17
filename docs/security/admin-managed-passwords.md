# Passwords are managed by an administrator

In UNISON nobody changes their own password. An **Owner** or **Admin** sends the person a reset link, from
**Settings, Users & access**.

## What people see
* Sign-in has no "Forgot password?" link. It says an administrator can send a reset link.
* `/forgot-password` shows "Passwords are managed for you". It does not ask for an email.
* `/reset-password` shows the new-password form **only** to a session that was started by clicking a reset link an
  administrator sent (Supabase's `recovery_sent_at` is within the last 60 minutes and the session began after it). Anyone else
  sees the same notice. The save checks the same rule, so going straight to the action does not work either.

## What an administrator does
Settings, Users & access, the person's row, **Send reset link**, then confirm. The email goes to the address on file; the link
works for 60 minutes. Rules (checked on the server): Owners can send to anyone, Admins to Members and other Admins but never to
an Owner, Members to nobody, and nobody to themselves from this page. The person must be an active member of the workspace.

## Limits worth knowing
* People who sign in with **Microsoft** use their Microsoft password; UNISON does not hold it, so there is nothing to reset
  here.
* This controls what UNISON's own pages and server actions allow. Supabase's public Auth API is still reachable by someone
  technical, and can send a recovery email to their own address or change their own password while signed in. To close that
  as well, set it in the Supabase dashboard (Authentication): turn on "Secure password change" (a recent sign-in is then
  required to change a password) and consider turning off email and password sign-in for everyone who uses Microsoft.
* Supabase limits how often a reset email can be sent to one address (about one a minute).
