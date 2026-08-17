-- Production account-center data. Auth credentials and verified email/phone remain in auth.users.
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists date_of_birth date,
  add column if not exists country_code text not null default 'NG',
  add column if not exists state text,
  add column if not exists city text;

alter table public.profiles
  drop constraint if exists profiles_display_name_length,
  add constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 2 and 50),
  drop constraint if exists profiles_avatar_url_length,
  add constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 500),
  drop constraint if exists profiles_country_code_format,
  add constraint profiles_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  drop constraint if exists profiles_state_length,
  add constraint profiles_state_length check (state is null or char_length(state) <= 80),
  drop constraint if exists profiles_city_length,
  add constraint profiles_city_length check (city is null or char_length(city) <= 80),
  drop constraint if exists profiles_date_of_birth_range,
  add constraint profiles_date_of_birth_range check (date_of_birth is null or (date_of_birth <= current_date and date_of_birth >= date '1900-01-01'));

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_notifications boolean not null default true,
  sms_notifications boolean not null default true,
  push_notifications boolean not null default true,
  marketing_notifications boolean not null default false,
  transaction_alerts boolean not null default true,
  security_alerts boolean not null default true,
  preferred_language text not null default 'en',
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_language check (preferred_language in ('en')),
  constraint user_settings_timezone_length check (char_length(timezone) between 1 and 64)
);

alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;

revoke all on public.user_settings from anon;
grant select, insert, update on public.user_settings to authenticated;

drop policy if exists "Users read their own settings" on public.user_settings;
create policy "Users read their own settings" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own settings" on public.user_settings;
create policy "Users create their own settings" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own settings" on public.user_settings;
create policy "Users update their own settings" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at before update on public.user_settings
for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;
