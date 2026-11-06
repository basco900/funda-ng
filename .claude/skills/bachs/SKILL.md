---
name: bachs
description: Build and maintain Bachs payment integrations — including NGN Virtual Accounts (platform & per-user dedicated Connected Accounts), Wallet Funding, One-Time Hosted/Overlay Checkout, SaaS Subscriptions, Marketplace Connect Split Payments, Webhook Signature V2 verification, and Pre-Launch Go-Live Reviews.
---

# Build with Bachs

Implement and maintain Bachs payment, virtual account, wallet funding, subscription, and Connect flows. Always follow the official Bachs API conventions and documentation (`https://docs.bachs.io/llms.txt`).

## Core Conventions

1. **Money Format**: Money is **always** a decimal string at the currency's precision (e.g. `"250.00"`), paired with an ISO 4217 currency field (`"NGN"`, `"USD"`). Never send numbers, floats, or minor units (kobo/cents).
2. **Environments & Keys**:
   - Sandbox: `https://sandbox-api.bachs.io` with `sk_sandbox_...` keys.
   - Production: `https://api.bachs.io` with `sk_live_...` keys.
   - Going live is a key swap. Never expose secret keys to the client or log full provider error bodies.
3. **Source of Truth**: Treat verified webhooks (`collection.succeeded`, `checkout.completed`, `capability.updated`) as the sole source of truth for wallet credits and order fulfilment—never client-side events or redirects.
4. **Resource IDs & Timestamps**: IDs carry resource prefixes (`acct_`, `va_`, `chk_`, `ch_`, `cust_`, `prod_`, `sub_`, `inv_`, `ref_`, `whe_`, `evt_`) and timestamps are ISO 8601 UTC.

## Reference Documentation Map

Fetch `.md` versions of any Bachs doc page directly when needed:

| Workflow / Topic | Documentation URL |
| --- | --- |
| Full Index | `https://docs.bachs.io/llms.txt` |
| Introduction | `https://docs.bachs.io/introduction.md` |
| Virtual Accounts Guide | `https://docs.bachs.io/guides/virtual-accounts/overview.md` |
| Virtual Account Object | `https://docs.bachs.io/api-reference/virtual-accounts/object.md` |
| Checkout Sessions | `https://docs.bachs.io/guides/checkout/checkout-sessions.md` |
| Overlay Checkout (`@bachs/js`) | `https://docs.bachs.io/guides/checkout/overlay-checkout.md` |
| Webhooks & Signature V2 | `https://docs.bachs.io/guides/webhooks/overview.md` |
| Connect Overview | `https://docs.bachs.io/connect/overview.md` |
| Acting as an Account (`X-Account-Id`) | `https://docs.bachs.io/connect/acting-as-an-account.md` |
| Capabilities & Requirements | `https://docs.bachs.io/connect/capabilities.md` |
| Transfers (Account ↔ Platform) | `https://docs.bachs.io/connect/transfers.md` |
| Deposit Limits | `https://docs.bachs.io/guides/payments/deposit-limits.md` |
| API Permissions / Scopes | `https://docs.bachs.io/api-reference/permissions.md` |
| Error Reference | `https://docs.bachs.io/api-reference/error-reference.md` |
| Pre-Launch Go-Live Checklist | `https://docs.bachs.io/go-live.md` |

## Official SDK Usage (`@bachs/sdk` >= 2.0.0)

- Install `@bachs/sdk` (`>= 2.0.0`) on Node.js 22+ servers.
- Construct the client with `{ apiKey }` only; the key prefix (`sk_sandbox_` vs `sk_live_`) automatically selects the environment.
- Use `webhooks.constructEvent(rawBody, request.headers, process.env.BACHS_WEBHOOK_SECRET)` or a timing-safe `X-Bachs-Signature-V2` verifier that checks all `v1=` signatures in the header against `"{timestamp}.{rawBody}"` (supporting zero-downtime 24-hour secret rotation).
- For endpoints not yet wrapped by the SDK (Virtual Accounts, Connect accounts, Persons/Requirements, Transfers, Customers, Refunds, Disputes), make direct authenticated `fetch` calls to the Bachs REST API using the same API key and `Idempotency-Key` headers.

## Workflow 1: Virtual Accounts & Wallet Funding

Bachs issues permanent 10-digit NGN bank account numbers (`va_...`) that never expire and accept bank transfers of **any amount** from any Nigerian bank.

### Required API Key Scopes
Existing API keys do **not** get Virtual Account scopes automatically. Ensure the key has:
- `virtual_accounts:read` (for `GET /v1/virtual-accounts?currency=NGN`)
- `virtual_accounts:write` (for `POST /v1/virtual-accounts`)
- `connected_accounts:write` (when issuing dedicated per-user virtual accounts via Connect)
- `transfers:write` (when sweeping funds from connected accounts to the platform balance)
- `webhooks:write` (to ensure webhook endpoint has `event_source: "all"`)

### Architecture: Per-User Dedicated Virtual Accounts vs Platform Virtual Account
Bachs issues **one virtual account per account, per currency (`NGN`)**:
1. **Dedicated Virtual Account per User (via Connected Accounts)**:
   - Create a Connected Account for the user (`POST /v1/accounts`):
     ```json
     {
       "contact_email": "user@example.com",
       "display_name": "Funda - Jane Doe",
       "country": "NG",
       "configuration": {
         "merchant": { "capabilities": { "virtual_accounts": { "requested": true } } },
         "recipient": { "capabilities": { "transfers": { "requested": true } } }
       }
     }
     ```
     The `display_name` becomes the bank account name senders see when transferring.
   - Submit the representative (`POST /v1/accounts/{account_id}`):
     - Requires `first_name`, `last_name`, `id_numbers: [{ type: "bvn", value: "...", issuing_country: "NG" }]`, and `relationship: { representative: true }`.
     - **Important**: Bachs allows several connected accounts to use the **same representative and BVN** (e.g., the platform owner's BVN via `BACHS_REPRESENTATIVE_BVN`, `BACHS_REPRESENTATIVE_FIRST_NAME`, `BACHS_REPRESENTATIVE_LAST_NAME`), OR the user can supply their own BVN.
   - Issue/Read the Virtual Account (`POST /v1/virtual-accounts` with `{ "currency": "NGN" }` and header `X-Account-Id: acct_...`):
     - In sandbox, `virtual_accounts` is `active` immediately. In live mode, once `virtual_accounts` is `active` (reported via `capability.updated`), calling `POST /v1/virtual-accounts` returns or creates the permanent 10-digit NGN account number. Calling `POST` again is idempotent and returns the same number.
2. **Platform Virtual Account (`POST /v1/virtual-accounts` without `X-Account-Id`)**:
   - Issues one permanent NGN account number for the main organization.
   - Match deposits using saved `sender_account_number` or a unique customer transfer reference in `narration`.

### Receiving & Crediting Virtual Account Deposits (`collection.succeeded`)
When a customer transfers money to a virtual account, Bachs delivers `collection.succeeded`:
- **Distinguishing Deposits from Checkouts**:
  - A virtual account deposit has `data.checkout_id === null` and `data.payment_method_details?.bank_transfer?.virtual_account?.type === "permanent"`.
  - Never reject `collection.succeeded` just because `checkout_id` is `null`!
- **Connected Account Event Delivery**:
  - Ensure your webhook endpoint is configured with `"event_source": "all"` (`PATCH /v1/webhooks/endpoints/{endpoint_id}`) so it receives events from both your platform account and all connected accounts (`event.account` / `event.organization_id`).
- **Matching & Crediting**:
  - Match the deposit to the user by:
    1. `event.account` / `event.organization_id` matching `user_virtual_accounts.bachs_account_id`
    2. `virtual_account.id` or `virtual_account.account_number` matching `user_virtual_accounts.account_number`
    3. `bank_transfer.narration` containing the user's `transfer_reference_code`
    4. `bank_transfer.sender_account_number` matching a previously verified payer account for that user
  - Handle `null` on all sender fields (`sender_name`, `sender_bank`, `sender_account_number`, `narration` can all be `null` depending on the sending bank).
  - Deduplicate durably on `event.id` and `data.charge_id`.
  - Remember the fee structure: Bachs deducts `1%` capped at `NGN 300` (`data.processing_fee`, `data.settlement_amount`).
  - If the deposit landed on a Connected Account (`event.account`), optionally sweep `data.settlement_amount` back to the platform balance via `POST /v1/transfers` with `X-Account-Id: {event.account}` and `{ "destination": "self", "currency": "NGN", "amount": data.settlement_amount }`.
- **No Artificial Minimums**:
  - Virtual account transfers have no minimum amount; customers can transfer any amount (`₦50`, `₦100`, `₦500`, etc.). Do not block small deposits in database constraints or UI forms.

## Workflow 2: One-Time Checkout & Overlay Checkout

- Create checkout sessions on the server via `POST /v1/checkout-sessions` using `pricing: { currency: "NGN", amount: "500.00" }` (for dynamic wallet top-ups) or `product_cart` (for catalog items), along with a unique `reference` and persisted `Idempotency-Key`.
- Open the checkout in the inline overlay (`@bachs/js` / `openBachsCheckout`) or redirect to `checkout_url`.
- Fulfil once on verified `collection.succeeded` (or `checkout.completed` after verifying status, amount, and currency).
- `collection.failed` is not final (the checkout stays open), and a payment can still complete after `checkout.expired`.

## Workflow 3: Webhook Verification & Reliability Rules

- Verify `X-Bachs-Signature-V2` (or `X-Bachs-Signature` + `X-Bachs-Timestamp`) against the **raw request body string** before `JSON.parse`.
- Parse `X-Bachs-Signature-V2` by splitting on `,`, extracting `t=<timestamp>` (enforcing a 300-second tolerance), and collecting all `v1=<hex>` values. Accept if **any** `v1` signature matches `HMAC-SHA256(secret, "{timestamp}.{rawBody}")` via `timingSafeEqual`.
- Return `400`/`401` **only** for invalid signatures or malformed envelopes. If database or internal processing fails, return `500` so Bachs retries delivery (up to 5 attempts over ~80 minutes). Never return `409` or `4xx` on transient DB errors, as Bachs stops retrying on `4xx` (except `408`/`429`).

## Workflow 4: Pre-Launch Review Checklist

When asked to review an integration:
- Check that no `sk_live_` or `sk_sandbox_` keys reach client code.
- Check that all amounts are formatted as decimal strings (`"500.00"`), never numbers or minor units.
- Check that webhook verification uses the raw body and supports `X-Bachs-Signature-V2` multi-signature rotation.
- Check that `collection.succeeded` handles both checkout payments (`checkout_id` present) and virtual account deposits (`checkout_id: null`).
- Check that webhook endpoints have `event_source: "all"` if Connect accounts are used.
- Check that API keys have `virtual_accounts:read` and `virtual_accounts:write` enabled in the Bachs Developer Portal.
