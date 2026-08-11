# Permissions

Authentication and authorization are not implemented yet. `config/permissions.ts` is the central catalogue for future permission definitions, while enforcement infrastructure is reserved under `lib/permissions/`.

Permissions should be capability-based, checked on the server, and complemented by database row-level security when persistence is introduced. Hiding a UI control is not authorization.

