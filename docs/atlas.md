# Atlas

Atlas currently exists only as static overview insight cards. There is no model provider, retrieval layer, prompt system, action execution, or persistence integration.

Future Atlas domain UI belongs in `features/atlas/`. Provider and platform integration belongs in `lib/atlas/`. Atlas must not be given write access to business records without explicit authorization, auditing, and confirmation boundaries.

