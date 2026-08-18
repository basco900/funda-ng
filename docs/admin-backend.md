# Funda Admin backend

The admin is a separate, server-only control plane at `/admin`. It does not trust a browser-held role, does not expose the Supabase service key, and does not let client roles read operational tables.

## What is implemented

- Supabase Auth sign-in with an HMAC-hashed login-attempt log, per-identity/IP throttling, server-side allow-list bootstrap, and database-backed admin access.
- Roles and granular permissions. Every write action checks a specific permission on the server.
- Immutable audit events with actor, before/after values, reason, IP, user agent, and request ID.
- Maker-checker approvals. A requester cannot approve or execute their own financial action; larger changes can require two approvals.
- Atomic, ledger-backed wallet credits/debits and refunds. Database locks, unique references, idempotent records, and non-negative balances protect money movement.
- Customer controls, internal notes, KYC review, devices, risk, account tiers, and temporary overrides.
- Service transactions, append-only timelines, provider attempts, product catalogue, price/commission rules, provider routing, balances, health, and incidents.
- Support, disputes, campaigns, coupons, cashback, referrals, segments, announcements, and multi-channel delivery records.
- Reconciliation, settlement and immutable daily financial snapshots.
- Redacted API/webhook diagnostics, health checks, feature flags, runtime configuration, saved views, and export jobs.
- Live admin repositories and protected search/operations APIs. Sensitive configuration values are never returned in workspace rows.

## First deployment

1. Back up the production Postgres database and test restoration.
2. Apply migrations in order, especially:
   - `supabase/migrations/202608180004_admin_control_plane.sql`
   - `supabase/migrations/202608180005_admin_backend.sql`
   - `supabase/migrations/202608180006_admin_operations_runtime.sql`
3. Run `supabase/tests/admin_backend_security.sql` on a staging clone.
4. Set these only on the Funda application server in Coolify:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server-only; never `NEXT_PUBLIC_`)
   - `FUNDA_SUPER_ADMIN_EMAILS`
   - `FUNDA_ADMIN_SECURITY_PEPPER` (at least 32 random bytes)
   - `FUNDA_ADMIN_WORKER_SECRET` (a separate random secret for scheduled workers)
5. Make sure an email in `FUNDA_SUPER_ADMIN_EMAILS` already exists in Supabase Auth. Its first successful admin login creates its `admin_users` record with the Super Admin role.
6. Deploy, sign in at `/admin/login`, then remove stale bootstrap emails as named administrators are established.

## Financial invariants

- Never update `wallets.available_balance` from an HTTP handler or UI action.
- Use `admin_request_wallet_adjustment` followed by an independent approval and `admin_execute_wallet_adjustment`.
- Use `admin_request_refund` followed by an independent approval and `admin_execute_refund`.
- Ledger entries and transaction events are append-only. Corrections use a compensating entry, not an edit.
- Provider webhook handlers must verify signatures before recording or acting on payloads.
- Provider calls should use unique idempotency keys and write only redacted telemetry.

## Worker responsibilities

The database and control-plane functions are ready, but production schedulers still need to call them:

- Provider health checks: every 1–5 minutes.
- Stale pending-transaction sweeper: every 2–5 minutes.
- Message delivery worker: continuously, respecting `throttle_per_minute` and provider opt-outs.
- Reconciliation imports: daily and on demand through `executeReconciliationRun`.
- Financial snapshot: once after UTC/Lagos business-day close through `generateDailyFinancialSnapshot`.
- Export worker: process `admin_export_jobs`, store encrypted output, and expire it after seven days.
- Retention worker: prune diagnostic payloads under the approved data-retention policy; never prune audit or ledger records casually.

Coolify can call `POST /api/admin/jobs/run` every minute with `Authorization: Bearer $FUNDA_ADMIN_WORKER_SECRET`. The endpoint is deliberately separate from browser admin auth. It atomically claims jobs, records failures, retries bounded jobs, and never exposes job payloads to the customer application.

## Operational runbooks

### Failed or pending transaction

1. Open the transaction timeline and provider attempts.
2. Requery the provider with its immutable reference; do not blindly resend.
3. Transition only through `admin_transition_service_transaction` so a timeline event is produced.
4. Refund through maker-checker if value was taken and service was not delivered.

### Provider incident

1. Mark the provider degraded/down and open an incident.
2. Disable or reprioritise affected routes.
3. Monitor balance, success rate, latency, and the pending queue.
4. Restore routes gradually and close the incident with a clear resolution note.

### Suspicious customer

1. Open a risk case and retain evidence in redacted form.
2. Apply the narrowest account/wallet restriction and record a reason.
3. Review KYC, devices, IPs, limits, transactions, disputes, and internal notes.
4. Restore access only after documenting the decision in the audit trail.

## External services still required

- Transactional email: Resend is already configured; keep SPF, DKIM, and DMARC healthy.
- Nigerian SMS/OTP: Termii is a strong local option; configure a Supabase Send SMS hook and test DND-route delivery.
- Monitoring: Sentry for application errors and Better Stack/Uptime Kuma for external uptime.
- Edge protection: Cloudflare TLS, WAF, rate limiting, bot controls, and origin lockdown.
- Backups: encrypted offsite Postgres backups plus tested point-in-time recovery.

No system is literally impenetrable. This design reduces blast radius through least privilege, forced RLS, server-only secrets, immutable evidence, independent approvals, atomic money functions, redaction, and recovery procedures.
# Phase 3 delivery and operational execution

- The worker now runs private report exports (`CSV` and `JSON`), provider re-queries, and campaign delivery. It never delivers a message merely because a campaign exists; each message has a durable `message_delivery`, `notification_outbox`, and delivery-attempt trail.
- Email delivery uses Resend only with both `RESEND_API_KEY` and `FUNDA_EMAIL_FROM`. SMS delivery uses Termii only with `TERMII_API_KEY` and `TERMII_SENDER_ID`. Missing contact information and unconfigured channels are suppressed and audited as delivery failures; they do not result in a fake success.
- Exports are placed in a private `admin-exports` Supabase Storage bucket. A signed link lasts 60 seconds, exports expire after seven days, and non-super-admins can download only exports they created.
- Provider requery delegates only to existing configured VTpass, SMEPlug, GladTidings, or Pairgate adapters. It records a redacted provider attempt and uses the guarded transaction transition function; it cannot overwrite terminal transactions.
- Admin session invalidation sets a server-enforced cutoff on the admin identity. Existing sessions are denied on their next protected request until a fresh Supabase sign-in updates `last_sign_in_at`. This avoids unsupported direct writes to Supabase Auth session tables.

# Phase 4 customer commerce

- Apply `202608180009_customer_service_purchases.sql` before enabling the live purchase UI. It creates the only two procedures allowed to debit and settle service purchases. They lock the wallet row, enforce idempotency, maintain the ledger, and auto-refund only a definitive provider failure.
- `GET /api/services/catalog` and `POST /api/services/purchase` require a logged-in customer. The purchase endpoint accepts a UUID product ID, destination, and client idempotency key; it does not accept prices, provider credentials, or an arbitrary provider choice.
- Only data and airtime are enabled in this phase. A pending or uncertain provider response leaves the wallet debit intact and queues a safe provider requery; it is never refunded optimistically.
- Customers may read only their own service transactions through `GET /api/services/transactions/:id`. Each terminal/pending outcome creates an in-app receipt notification.
