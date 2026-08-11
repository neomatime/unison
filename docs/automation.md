# Automation

Automation currently appears only as static overview status data. No workflow engine, scheduler, event bus, job queue, or execution service exists.

Business-facing automation screens and rules belong in `features/automation/`. Execution infrastructure belongs in `lib/automation/`. Future runs should be idempotent, observable, retry-safe, permission-aware, and recorded through the audit layer.

