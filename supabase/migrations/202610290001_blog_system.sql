-- Migration: 202610290001_blog_system.sql
-- Description: Complete Blog system (Categories, Posts, Comments, Full RLS, and Views Increment RPC)

-- 1. Blog Categories Table
create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  icon text default 'newspaper',
  color text default '#660033',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Blog Posts Table
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  excerpt text not null,
  content text not null,
  featured_image text,
  category_id uuid references public.blog_categories(id) on delete set null,
  category_slug text not null default 'general',
  tags text[] not null default '{}',
  author_name text not null default 'Funda Editorial',
  author_avatar text,
  author_role text default 'Staff Writer',
  status text not null default 'published' check (status in ('draft', 'published', 'scheduled', 'archived')),
  published_at timestamptz default now(),
  reading_time_minutes int not null default 3,
  views_count int not null default 0,
  likes_count int not null default 0,
  is_featured boolean not null default false,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Blog Comments & Questions Table
create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  parent_id uuid references public.blog_comments(id) on delete cascade,
  author_name text not null,
  author_email text,
  content text not null,
  is_admin_reply boolean not null default false,
  is_approved boolean not null default true,
  likes_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes for lightning fast queries
create index if not exists idx_blog_posts_slug on public.blog_posts(slug);
create index if not exists idx_blog_posts_published on public.blog_posts(status, published_at desc);
create index if not exists idx_blog_posts_category on public.blog_posts(category_slug);
create index if not exists idx_blog_posts_featured on public.blog_posts(is_featured) where is_featured = true;
create index if not exists idx_blog_comments_post_id on public.blog_comments(post_id, created_at asc);

-- 4. Atomic Views & Likes Increment RPC
create or replace function public.increment_blog_post_views(p_slug text)
returns void
language plpgsql
security definer
as $$
begin
  update public.blog_posts
  set views_count = views_count + 1
  where slug = p_slug;
end;
$$;

create or replace function public.increment_blog_post_likes(p_post_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_new_count int;
begin
  update public.blog_posts
  set likes_count = likes_count + 1
  where id = p_post_id
  returning likes_count into v_new_count;
  return v_new_count;
end;
$$;

-- 5. Row Level Security Policies
alter table public.blog_categories enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_comments enable row level security;

-- Public read policies
drop policy if exists "Public can read categories" on public.blog_categories;
create policy "Public can read categories" on public.blog_categories
  for select using (true);

drop policy if exists "Public can read published posts" on public.blog_posts;
create policy "Public can read published posts" on public.blog_posts
  for select using (
    status = 'published' and (published_at is null or published_at <= now())
  );

drop policy if exists "Public can read approved comments" on public.blog_comments;
create policy "Public can read approved comments" on public.blog_comments
  for select using (is_approved = true);

drop policy if exists "Public can insert comments" on public.blog_comments;
create policy "Public can insert comments" on public.blog_comments
  for insert with check (
    length(trim(content)) > 0 and length(trim(author_name)) > 0
  );

-- Admin Full Access policies (Service Role & Admin roles)
drop policy if exists "Admins have full access to blog categories" on public.blog_categories;
create policy "Admins have full access to blog categories" on public.blog_categories
  for all using (
    auth.role() = 'service_role' or exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.status = 'active'
    )
  );

drop policy if exists "Admins have full access to blog posts" on public.blog_posts;
create policy "Admins have full access to blog posts" on public.blog_posts
  for all using (
    auth.role() = 'service_role' or exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.status = 'active'
    )
  );

drop policy if exists "Admins have full access to blog comments" on public.blog_comments;
create policy "Admins have full access to blog comments" on public.blog_comments
  for all using (
    auth.role() = 'service_role' or exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.status = 'active'
    )
  );

-- 6. Seed Categories
insert into public.blog_categories (name, slug, description, sort_order)
values
  ('Telecoms & Data', 'telecoms-data', 'SME data guides, network comparison, airtime hacks and rollover tips.', 1),
  ('Electricity & Utilities', 'electricity-utilities', 'Token generation guides, Band A-E tariffs, meter troubleshooting and energy savings.', 2),
  ('Fintech & Payments', 'fintech-payments', 'Virtual accounts, instant bank transfers, fraud prevention and cashback perks.', 3),
  ('Education & Exams', 'education-exams', 'JAMB profile codes, WAEC/NECO result checker cards and admission registration advice.', 4),
  ('Company & Product', 'product-updates', 'New Funda features, platform improvements, partnerships and behind the scenes.', 5)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description;

-- 7. Seed Initial Comprehensive Blog Posts
insert into public.blog_posts (
  title,
  slug,
  excerpt,
  content,
  featured_image,
  category_slug,
  tags,
  author_name,
  author_avatar,
  author_role,
  status,
  is_featured,
  reading_time_minutes,
  views_count,
  likes_count,
  published_at
)
values
(
  'How to Avoid Losing Unused Data: The Ultimate Nigerian Data Rollover Guide',
  'how-to-avoid-losing-unused-data-nigerian-rollover-guide',
  'Never let your hard-earned gigabytes vanish. Here is how data rollover works on MTN, Airtel, Glo, and 9mobile, plus secret scheduling tips.',
  E'# How to Avoid Losing Unused Data: The Ultimate Nigerian Data Rollover Guide\n\nThere are few things as frustrating as receiving an SMS that reads: *"Your data balance has expired."* You check your phone, only to realize that 8GB of data you paid good money for simply disappeared into thin air.\n\nUnder NCC regulations in Nigeria, telecom subscribers have the legal right to roll over unused data from a previous subscription. However, the exact rules and timing windows differ significantly between **MTN**, **Airtel**, **Glo**, and **9mobile**.\n\nIn this comprehensive breakdown, we explain exactly how data rollover works across all major networks, the grace periods allowed, and how smart Nigerians use Funda to automate their renewals.\n\n---\n\n## 1. How Data Rollover Works by Network\n\n### MTN Nigeria\nMTN allows automatic data rollover on all daily, weekly, and monthly SME and corporate gifting plans, provided you renew before the validity expiration or within the grace window.\n\n- **Daily Plans:** 1 day grace period.\n- **Weekly Plans:** 7 days grace period.\n- **Monthly Plans (30 days):** Up to 7 days grace period.\n\n> **Pro-Tip:** If your plan expires on Friday at 11:59 PM, buying even a smaller plan of the same tier before the deadline will instantly merge your leftover balance with the new plan.\n\n### Airtel Nigeria\nAirtel operates an all-inclusive rollover system. Any monthly bundle renewed within the active window rolls over 100% of the unused data. However, promotional bonus balances do not roll over.\n\n### Glo Nigeria\nGlobacom offers some of the largest data volumes in Nigeria, but their rollover policy requires an active auto-renewal setting or manual top-up within 24 hours of expiry.\n\n### 9mobile\n9mobile allows you to roll over unused data on any continuous plan. If your bundle expires, you have up to 72 hours to re-subscribe to retrieve your previous balance.\n\n---\n\n## 2. Three Common Mistakes That Void Your Rollover\n\n1. **Downgrading Plan Tiers:** Switching from a 30-day monthly plan to a 1-day daily plan often breaks the rollover chain on certain networks.\n2. **Waiting Until After the Grace Period:** Once the grace window closes, the carrier’s database flushes the unspent volume permanently.\n3. **Relying on USSD When Lines are Busy:** Heavy network congestion during peak hours (like 11:30 PM) often causes USSD timeout errors, making you miss the renewal window.\n\n---\n\n## 3. How Funda Makes Data Renewals Seamless\n\nOn Funda, you can top up SME, Corporate, or Direct Data in under 3 seconds. Funda offers:\n\n- **Up to 3% Instant Cashback** on every single top-up.\n- **High-speed direct API dispatch** that bypasses slow USSD gateways.\n- **Automatic transaction receipts** sent straight to your email and in-app inbox.\n\nKeep your internet alive, safeguard your data balances, and stop letting expired data drain your wallet!',
  'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80',
  'telecoms-data',
  array['MTN', 'Airtel', 'Data Rollover', 'SME Data', 'Tech Tips'],
  'Tunde Balogun',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  'Telecoms Specialist',
  'published',
  true,
  5,
  1420,
  89,
  now() - interval '2 days'
),
(
  'Understanding Band A to E Electricity Tariffs: What You Pay per Kilowatt Hour',
  'understanding-band-a-to-e-electricity-tariffs-nigeria',
  'Confused about your electricity bills? Learn what Band A, B, C, D, and E mean, how token units are calculated, and how to verify your meter feeder.',
  E'# Understanding Band A to E Electricity Tariffs: What You Pay per Kilowatt Hour\n\nEver recharged ₦5,000 for your prepaid meter and wondered why you only received 23 units, when a few months ago the same ₦5,000 gave you over 70 units?\n\nYou are not alone. The Multi-Year Tariff Order (MYTO) by the Nigerian Electricity Regulatory Commission (NERC) fundamentally altered how electricity is billed across Nigeria based on Service Reflective Tariffs (SRT).\n\nHere is your definitive guide to understanding electricity bands, checking your feeder status, and knowing exactly what you are paying for.\n\n---\n\n## What are Electricity Service Bands?\n\nDiscos (such as IKEDC, EKEDC, AEDC, IBEDC, and others) classify all customers into 5 distinct bands based on the minimum guaranteed hours of electricity supply per day:\n\n| Band | Minimum Daily Supply | Approved NERC Tariff (Approx.) |\n| :--- | :--- | :--- |\n| **Band A** | 20+ Hours / Day | ₦206 – ₦225 per kWh |\n| **Band B** | 16 – 20 Hours / Day | ₦63 – ₦68 per kWh (Subsidized) |\n| **Band C** | 12 – 16 Hours / Day | ₦50 – ₦55 per kWh (Subsidized) |\n| **Band D** | 8 – 12 Hours / Day | ₦40 – ₦45 per kWh (Subsidized) |\n| **Band E** | 4 – 8 Hours / Day | ₦32 – ₦36 per kWh (Subsidized) |\n\n> **Important Note:** Only **Band A** feeders currently pay the non-subsidized cost-reflective rate. If your feeder falls short of delivering 20 hours over a consecutive monitoring period, NERC regulations mandate the Disco to downgrade the feeder to Band B.\n\n---\n\n## How are Meter Units Calculated?\n\nWhen you buy an electricity token on Funda, the number of units generated is computed as:\n\n$$\\text{Units (kWh)} = \\frac{\\text{Recharge Amount} - \\text{VAT (7.5\\%)}}{\\text{Tariff Rate per kWh}}$$\n\nIf your Disco charges a fixed monthly service charge or outstanding debt collection, that amount is deducted by the Disco prior to token unit conversion.\n\n---\n\n## 3 Quick Steps to Optimize Your Energy Consumption\n\n1. **Shift Heavy Appliances to Off-Peak Hours:** Run washing machines, water pumps, and heavy irons during early morning hours.\n2. **Use Inverter Appliances:** Inverter ACs and refrigerators cut kilowatt-hour draw by up to 45% compared to standard compressor units.\n3. **Buy Tokens on Funda for Instant Delivery:** Skip queues, get verified meter owner details in real time, and receive your 20-digit token code via SMS and on-screen in seconds with **zero hidden charges**!',
  'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=80',
  'electricity-utilities',
  array['Electricity', 'IKEDC', 'AEDC', 'Prepaid Meter', 'NERC', 'Tariffs'],
  'Chidinma Eze',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
  'Energy Analyst',
  'published',
  false,
  4,
  870,
  54,
  now() - interval '4 days'
),
(
  'Everything You Need to Know About Generating a JAMB 2026 Profile Code',
  'jamb-profile-code-generation-guide-2026',
  'Step-by-step guide on generating your JAMB Profile Code via SMS, retrieving forgotten codes, and buying authentic e-PINs with zero stress.',
  E'# Everything You Need to Know About Generating a JAMB 2026 Profile Code\n\nPreparing for the Unified Tertiary Matriculation Examination (UTME) or Direct Entry (DE) starts with one vital prerequisite: **generating your 10-digit JAMB Profile Code** using your National Identification Number (NIN).\n\nWithout a valid profile code, no accredited CBT centre can vend your form or capture your biometrics.\n\nIn this walkthrough, we guide prospective candidates and parents through the exact steps, common error codes, and how to purchase genuine JAMB e-PINs.\n\n---\n\n## Step 1: Generating the Profile Code\n\nUsing the SIM card registered with your NIN, open your SMS app and send the following message to either **55019** or **66019**:\n\n```text\nNIN 12345678901\n```\n*(Replace 12345678901 with your actual 11-digit NIN. Make sure there is a single space between NIN and your number.)*\n\n### Expected Response\nYou will receive a 10-digit profile code sent back to your phone. Save this message carefully.\n\n> **Requirement:** You need at least ₦50 airtime balance on your SIM to cover the carrier SMS tariff for 55019 / 66019.\n\n---\n\n## Common Errors and How to Solve Them\n\n- **Error: "Record Not Found"** — This means NIMC has not yet synced your NIN to the telco database. Wait 24 to 48 hours or verify your NIN at a NIMC centre.\n- **Error: "Date of Birth Mismatch"** — Your date of birth on NIMC differs from previous records. Update your profile at a NIMC enrollment centre before proceeding.\n- **Error: "Phone Number Already Used"** — In JAMB rules, a phone number can only be linked to one candidate per examination year.\n\n---\n\n## How to Retrieve a Lost Profile Code\n\nIf you accidentally deleted your SMS, send:\n```text\nRESEND to 55019 or 66019\n```\nusing the exact same phone number.\n\n---\n\n## Where to Buy Your JAMB e-PIN\n\nOnce your profile code is ready, you can vend your authentic **JAMB UTME or Direct Entry e-PIN** directly on **Funda Education Services**. The PIN is instantly delivered to your screen and receipt inbox, ready to be taken to any accredited CBT centre nationwide!',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
  'education-exams',
  array['JAMB', 'UTME', 'Profile Code', 'Education', 'NIN', 'WAEC'],
  'Dr. Aminu Garba',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
  'Education Advisor',
  'published',
  false,
  3,
  1130,
  72,
  now() - interval '6 days'
),
(
  'Virtual Accounts in Nigeria: How Dedicated NGN Bank Accounts Are Changing FinTech',
  'virtual-accounts-nigeria-future-of-fintech-payments',
  'Discover how dedicated virtual accounts work behind the scenes, why card failures are disappearing, and how Funda delivers instant wallet deposits.',
  E'# Virtual Accounts in Nigeria: How Dedicated NGN Bank Accounts Are Changing FinTech\n\nRemember the days when funding a digital wallet in Nigeria meant entering your 16-digit debit card number, waiting for a One-Time Password (OTP) that never arrived, and having money debited with no credit reflecting on the merchant\'s app?\n\nThose days are rapidly fading away. The arrival of **Dedicated Virtual Accounts** backed by NIBSS Instant Payments (NIP) and core microfinance banking infrastructure has completely transformed the payment landscape in Nigeria.\n\n---\n\n## What is a Dedicated Virtual Account?\n\nUnlike traditional pooled accounts where thousands of users transfer funds to a single account with complicated reference numbers, a dedicated virtual account is uniquely assigned to **you**.\n\nWhen you open Funda, you receive your own personalized NGN account number (e.g., *Nombank MFB / Funda - Your Name*). Any transfer sent to that account from **any Nigerian bank app or USSD code** is immediately identified and credited to your wallet in milliseconds.\n\n---\n\n## Why Virtual Accounts Beat Card Checkout in Nigeria\n\n1. **Zero OTP Latency:** Card transactions rely on SMS OTPs from issuing banks, which suffer from telco delivery failures. Bank transfers over NIP settle automatically.\n2. **Higher Success Rates:** NIP direct bank transfers in Nigeria boast an average success rate exceeding 98.4%, compared to 76% on typical web card checkout gateways.\n3. **Privacy and Safety:** You never have to save your sensitive debit card CVV or expiry dates online.\n\n---\n\n## The Technology Behind Funda Wallet Funding\n\nFunda partners with licensed payment institutions to provide seamless, secure 24/7 account rails. Every deposit is matched against cryptographic webhook signatures, ensuring that your funds are safely accounted for, available immediately, and protected by end-to-end ledger immutability.\n\nExperience seamless payments today—open your Funda dashboard to get your free dedicated virtual account in seconds!',
  'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=80',
  'fintech-payments',
  array['Virtual Accounts', 'Fintech', 'Payments', 'Banking', 'NIP'],
  'Funda Engineering',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
  'Product & Infrastructure',
  'published',
  false,
  4,
  640,
  41,
  now() - interval '8 days'
)
on conflict (slug) do nothing;

-- 8. Seed Sample Realistic Comments
insert into public.blog_comments (post_id, author_name, author_email, content, is_admin_reply, is_approved, likes_count, created_at)
select
  id as post_id,
  'Emeka Nwosu',
  'emeka.nwosu@gmail.com',
  'This article saved me so much hassle! I didn''t know the grace period on MTN was actually 7 days for monthly bundles. Thank you Funda team!',
  false,
  true,
  7,
  now() - interval '1 day'
from public.blog_posts
where slug = 'how-to-avoid-losing-unused-data-nigerian-rollover-guide'
limit 1;

insert into public.blog_comments (post_id, author_name, author_email, content, is_admin_reply, is_approved, likes_count, created_at)
select
  id as post_id,
  'Funda Support',
  'support@funda.ng',
  'Glad it helped, Emeka! You can also enable automated reminders in your Funda dashboard so you never miss an expiry deadline.',
  true,
  true,
  4,
  now() - interval '18 hours'
from public.blog_posts
where slug = 'how-to-avoid-losing-unused-data-nigerian-rollover-guide'
limit 1;
