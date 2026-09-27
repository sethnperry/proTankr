# ProTankr Solo Billing (Stripe) — Runbook

Self-serve Solo subscriptions are fully built in code: checkout, webhook
activation, billing portal, and the real $39/mo pricing on `/pricing`. **None
of it can go live without a real Stripe account** — that part happens on
Stripe's site, not in this repo, and only you can do it (business info, a
bank account for payouts). This doc is the rest of the setup, in order.

Decided terms (see CLAUDE.md's Billing & Subscriptions section for the fuller
design conversation): **$39/month, monthly billing only, 14-day free trial,
card required up front but not charged until the trial ends.** Fleet stays a
placeholder ("TBD") — its pricing isn't decided yet.

---

## What's already built

- `app/pricing/page.tsx` — Solo's card shows the real price and a "Start Free
  Trial" button that calls `/api/stripe/checkout` and redirects to Stripe's
  hosted Checkout page. Fleet is untouched (still "Request Early Access").
- `app/api/stripe/checkout/route.ts` — creates the Checkout Session (public,
  no login required — this is how a brand-new customer signs up).
- `app/api/stripe/webhook/route.ts` — the **only** thing that actually
  activates an account. Verifies Stripe's signature, then on
  `checkout.session.completed`: finds-or-creates the customer's ProTankr
  account and solo company, records the subscription in
  `company_subscriptions`, and emails them a sign-in code (same branded
  email shape as every other invite in this app). Also keeps subscription
  status in sync on renewal/cancellation (`customer.subscription.updated` /
  `.deleted`).
- `app/api/stripe/portal/route.ts` — lets an existing Solo subscriber manage
  their payment method / view invoices / cancel, from Company Settings'
  "Manage Billing" button (`app/admin/CompanySettingsModal.tsx`).
- `app/checkout/success/page.tsx` — the page Stripe redirects to after
  checkout. Deliberately just says "check your email" — the webhook (not
  this page) is what actually finishes setting up the account, and it can
  land before or after this page loads.

Nothing here can run yet because there's no Stripe account, no Price object,
and no API keys. That's what's left.

---

## 1. Create the Stripe account

Go to [stripe.com](https://stripe.com) and sign up. You'll need:
- Business details (can be a sole proprietorship to start — you can add a
  formal entity later without losing anything).
- A bank account for payouts.

Stripe gives you a fully working **test mode** the moment you sign up, before
any of that business/bank info is even verified — you can build and test the
whole flow in test mode first, then flip to live mode once you're ready to
take real payments.

## 2. Create the Solo product + price

In the Stripe Dashboard (test mode to start):
1. **Product catalog → Add product.**
2. Name: `ProTankr Solo`.
3. Pricing: **Recurring**, **$39.00 / month**.
4. Save, then open the price you just created and copy its **Price ID**
   (starts with `price_...`) — this is `STRIPE_SOLO_PRICE_ID` below.

The 14-day trial and "monthly only" are both set in code
(`app/api/stripe/checkout/route.ts`'s `trial_period_days`), not on the Price
itself — so you don't need to configure a trial in the Dashboard.

## 3. Get your API keys

**Developers → API keys.** Copy the **Secret key** (starts with `sk_test_...`
in test mode, `sk_live_...` once you switch to live). This is
`STRIPE_SECRET_KEY`.

## 4. Set up the webhook

This is the one step that needs your deployed URL to already exist (it does —
`https://www.protankr.com`).

1. **Developers → Webhooks → Add endpoint.**
2. Endpoint URL: `https://www.protankr.com/api/stripe/webhook`
3. Events to send — select exactly these three:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Save, then open the endpoint and copy its **Signing secret** (starts with
   `whsec_...`) — this is `STRIPE_WEBHOOK_SECRET`.

## 5. Add the environment variables to Vercel

Project → Settings → Environment Variables. Add for **Production**:

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | from step 3 |
| `STRIPE_SOLO_PRICE_ID` | from step 2 |
| `STRIPE_WEBHOOK_SECRET` | from step 4 |

These four should already exist (the invite/vault-reset routes need them
too) — confirm they're set for Production, not just Preview:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL` (should be `https://www.protankr.com`),
`RESEND_API_KEY`, `INVITE_FROM_EMAIL`.

Redeploy after adding the new ones (env var changes need a fresh deploy to
take effect).

## 6. Confirm `company_subscriptions` is actually live

The webhook writes directly to `company_subscriptions`
(`supabase/migrations/20260814000000_company_subscriptions.sql`). This
migration was written well before this pass and this session couldn't verify
live whether it was ever applied (no database access from here). **Before
testing a real checkout**, run this in the Supabase SQL editor to check:

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_name = 'company_subscriptions';
```

If that comes back `0`, apply the migration file above in the SQL editor
first — otherwise the webhook's very first write will fail (Stripe will
retry it, but the customer's account won't be ready until it succeeds).

## 7. Test it for real, in test mode

1. Go to `https://www.protankr.com/pricing`, tap **Start Free Trial**.
2. Stripe's test mode accepts the card number `4242 4242 4242 4242`, any
   future expiry, any CVC, any ZIP.
3. Complete checkout → you should land on `/checkout/success`.
4. Check the email you used — you should get a real "Welcome to ProTankr"
   email with a sign-in code within a minute or two (this is the webhook
   firing).
5. Sign in with that code at `/login`, confirm you land in the Planner with
   a fresh solo company.
6. In the Stripe Dashboard, find that subscription and confirm
   `company_subscriptions` in Supabase shows `status: trialing` for the new
   company, with `stripe_customer_id`/`stripe_subscription_id` populated.
7. From `/admin` → Company Settings → **Manage Billing**, confirm it opens a
   real Stripe-hosted portal for that customer.

Once all of that works in test mode, switch the three Stripe env vars to
their **live mode** equivalents (a live-mode Price ID, a live-mode secret
key, and a live-mode webhook endpoint + its own signing secret — test and
live are separate webhook endpoints in Stripe) and you're taking real
payments.

---

## What's deliberately not built yet

- **No annual plan** — monthly only, per the decided terms. Adding one later
  is a second Price object plus a toggle on the pricing page, not a
  redesign.
- **No self-serve path for an existing (comped or Fleet) company to start
  paying** — today's checkout route only handles a brand-new signup. A
  comped account that wants to convert to real billing needs a manual step
  for now (a real checkout-for-existing-company flow is a reasonable later
  addition, using the same `client_reference_id` pattern Stripe recommends
  for attaching a Checkout Session to an already-known customer).
- **Fleet pricing** — still "TBD" everywhere, unchanged by this pass.
