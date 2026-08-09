# Funda

Funda is a mobile-first Nigerian utility web app. The current public release is a full-viewport onboarding and authentication design prototype; it does not send OTPs or create accounts yet.

## Public experience

- `/` contains four keyboard, wheel, touch, and auto-advancing brand stories.
- `/login` and `/register` open the interactive auth preview directly.
- Use `123456` as the demonstration OTP. Preview data is held only in component state and resets on refresh.
- `/api/health` is the dependency-free container health check.
- `/test` remains the isolated live/sandbox VTU engine test harness.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Useful checks are:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Install the Playwright Chromium browser once before the first E2E run:

```bash
npx playwright install chromium
```

## Dokploy deployment

The repository includes a multi-stage Node 22 `Dockerfile` and uses Next.js standalone output.

1. Create a Dokploy application from this repository and select Dockerfile deployment.
2. Expose container port `3000` and attach `funda.ng` with HTTPS enabled.
3. Set the health check path to `/api/health`.
4. Add provider environment variables through Dokploy rather than baking `.env` into the image.
5. Keep one running instance initially; if multiple instances are introduced, move in-memory `/test` state and cache coordination to shared infrastructure first.

The production container runs as a non-root user and includes its own health check.

## Reserved Supabase architecture

Real authentication is intentionally deferred. The next phase will run Supabase on a separate Dokploy-managed VPS, expose its public APIs at `https://api.funda.ng`, and keep Studio on a private protected hostname. Phone OTP will use a Supabase Send SMS Hook connected to Termii and Cloudflare Turnstile. No Supabase or Termii keys are needed for the current onboarding prototype.

## Core engine test

The mobile-first test console is available at `http://localhost:3000/test`.

1. Copy `.env.example` to `.env.local`.
2. Add Flutterwave sandbox credentials and a webhook secret hash.
3. Add VTpass sandbox API, public, and secret keys.
4. Add the SMEPlug private key when you are ready to call its live-only API.
5. Add the GladTidings API token to enable its data and airtime routes.
6. Add the Pairgate API key. Keep `PAIRGATE_TEST_MODE=true` until test purchases pass.
7. Start the app with `npm run dev`.

Wallet funding is collected through Flutterwave. Airtime and data purchases debit the in-memory test wallet and are fulfilled by the selected provider adapter. Restarting the server resets wallet and transaction state.

Configure these provider callback URLs on a publicly accessible deployment or tunnel:

```text
Flutterwave: https://YOUR_HOST/api/test/flutterwave/webhook
VTpass:      https://YOUR_HOST/api/test/vtpass/webhook?token=VTPASS_WEBHOOK_SECRET
SMEPlug:     https://YOUR_HOST/api/test/smeplug/webhook?token=SMEPLUG_WEBHOOK_SECRET
Pairgate:    https://YOUR_HOST/api/test/pairgate/webhook?token=PAIRGATE_WEBHOOK_SECRET
```

Keep `TRANSACTION_MODE=sandbox` until Flutterwave and VTpass sandbox purchases pass. SMEPlug's published API uses `https://smeplug.ng/api/v1` and does not publish a separate sandbox URL, so adding its private key may spend its real provider wallet balance.
