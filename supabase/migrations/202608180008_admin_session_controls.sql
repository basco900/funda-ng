-- Phase 3b: invalidate all active admin sessions without touching auth internals.
alter table public.admin_users add column if not exists session_invalid_before timestamptz;
create index if not exists admin_users_session_invalid_before_idx on public.admin_users(session_invalid_before) where session_invalid_before is not null;

-- This is server-enforced in lib/admin/auth.ts against auth.users.last_sign_in_at.
-- No browser or client-side flag is trusted for administrative access.
