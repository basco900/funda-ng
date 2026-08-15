# Funda authentication deployment

The application uses Supabase Auth for identity and password storage. Passwords are never stored or hashed by the Next.js app; Supabase Auth stores salted bcrypt hashes.

## Required services

1. Self-hosted Supabase on a dedicated hostname such as `supabase.funda.ng`.
2. Transactional email via SMTP. Recommended: Resend. Alternatives: Postmark or Amazon SES.
3. Nigerian SMS delivery. Recommended: Termii using a Supabase Send SMS Hook. Native Supabase-supported alternatives are Twilio, Vonage, MessageBird and TextLocal; confirm Nigerian DND-route delivery before selecting one.
4. Cloudflare in front of `funda.ng` and the Supabase endpoints for TLS, WAF, bot protection and rate limiting.
5. Sentry for sanitized application error reporting. Never send passwords, OTPs, JWTs, cookies, phone numbers or full emails to telemetry.
6. Uptime Kuma or Better Stack for availability monitoring and alerts.
7. Encrypted offsite Postgres backups with tested point-in-time recovery.

## Coolify / GoTrue essentials

- `GOTRUE_SITE_URL=https://funda.ng`
- `GOTRUE_URI_ALLOW_LIST=https://funda.ng/**,https://www.funda.ng/**`
- Enable email and phone providers.
- Require email and phone confirmation.
- Configure custom SMTP and branded confirmation/recovery templates.
- `MAILER_TEMPLATES_MAGIC_LINK=https://funda.ng/auth-emails/login-code.html`
- `MAILER_SUBJECTS_MAGIC_LINK=Your Funda login code`
- `MAILER_TEMPLATES_RECOVERY=https://funda.ng/auth-emails/recovery.html`
- `MAILER_SUBJECTS_RECOVERY=Reset your Funda password`
- Configure the SMS provider or Send SMS Hook.
- Set OTP expiry to 5–10 minutes and resend cooldown to at least 60 seconds.
- Set `GOTRUE_PASSWORD_MIN_LENGTH=6` and leave `GOTRUE_PASSWORD_REQUIRED_CHARACTERS` empty. Funda intentionally accepts any password with six or more characters.
- Enable refresh-token rotation and reuse detection.
- Keep access tokens short-lived (about one hour).
- Configure Auth rate limits and Cloudflare limits on `/auth/v1/*`.
- Keep all Supabase secrets, JWT secrets, SMTP passwords and SMS keys in Coolify secrets.
- Never expose `SUPABASE_SECRET_KEY` or the legacy service-role key to the browser.

## Database

Apply `supabase/migrations/202608130001_auth_profiles.sql`. Every user-owned table added later must enable and force RLS, revoke anonymous access, and restrict policies using `auth.uid()`.

## Application variables

Copy the Supabase values from `.env.example` into Coolify. The public URL and publishable key are intentionally browser-safe. The secret key is server-only.

## Security reality

No system is “impenetrable.” Production security comes from layered controls, timely patching, least privilege, RLS, rate limits, monitoring, backups, incident response, and regular independent penetration testing.
