-- ====================================================================
-- FUNDA LIVE CHAT & TELEGRAM TWO-WAY SYNC SYSTEM
-- ====================================================================

-- 1. Support Threads
create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_id text not null,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  status text not null default 'open' check (status in ('open', 'closed', 'resolved', 'archived')),
  last_message text,
  last_message_at timestamptz not null default now(),
  unread_user_count int not null default 0,
  unread_support_count int not null default 0,
  current_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Support Messages
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'support', 'system')),
  sender_name text not null,
  message text not null,
  attachments jsonb default '[]'::jsonb,
  telegram_message_id bigint,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Telegram Message Mappings
-- Maps telegram notification message_ids sent to the admin chat back to the support thread
create table if not exists public.telegram_message_mappings (
  id uuid primary key default gen_random_uuid(),
  telegram_message_id bigint not null unique,
  telegram_chat_id bigint not null,
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_support_threads_guest_id on public.support_threads(guest_id);
create index if not exists idx_support_threads_user_id on public.support_threads(user_id);
create index if not exists idx_support_threads_updated_at on public.support_threads(updated_at desc);
create index if not exists idx_support_messages_thread_id on public.support_messages(thread_id, created_at asc);
create index if not exists idx_telegram_mappings_tg_msg on public.telegram_message_mappings(telegram_message_id);

-- Enable RLS
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.telegram_message_mappings enable row level security;

-- Policies allowing access
drop policy if exists "Service role full access on threads" on public.support_threads;
create policy "Service role full access on threads" on public.support_threads for all using (true) with check (true);

drop policy if exists "Service role full access on messages" on public.support_messages;
create policy "Service role full access on messages" on public.support_messages for all using (true) with check (true);

drop policy if exists "Service role full access on tg mappings" on public.telegram_message_mappings;
create policy "Service role full access on tg mappings" on public.telegram_message_mappings for all using (true) with check (true);
