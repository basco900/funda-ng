-- Phase 3: customer notifications and private, worker-produced admin exports.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_id uuid unique references public.message_deliveries(id) on delete set null,
  title text not null,
  body text not null,
  kind text not null default 'campaign',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notification_title_length check (char_length(title) between 1 and 160),
  constraint user_notification_body_length check (char_length(body) between 1 and 4000),
  constraint user_notification_kind check (kind in ('campaign','transaction','security','support','system'))
);
create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id, created_at desc);

alter table public.user_notifications enable row level security;
alter table public.user_notifications force row level security;
revoke all on public.user_notifications from anon, authenticated;

-- Customer-facing reads are deliberately limited to the session's own inbox.
create policy user_notifications_read_own on public.user_notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_notifications_mark_read_own on public.user_notifications
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Outbox status remains server-only; the worker records a retry-safe attempt trail.
create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  status text not null,
  provider text,
  provider_reference text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint notification_delivery_attempt_status check (status in ('sending','sent','failed','suppressed'))
);
create index if not exists notification_delivery_attempts_outbox_created_idx on public.notification_delivery_attempts(outbox_id, created_at desc);

alter table public.notification_delivery_attempts enable row level security;
alter table public.notification_delivery_attempts force row level security;
revoke all on public.notification_delivery_attempts from anon, authenticated;

-- Service-role worker functions and the backend are the only mutators.
revoke all on public.user_notifications, public.notification_delivery_attempts from public;
