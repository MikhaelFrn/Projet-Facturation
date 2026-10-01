# EshetikVault SaaS — POS / Checkout Module

EshetikVault is a SaaS platform for beauty salons, spas, medical-aesthetics
clinics and hair salons. This repository is its **POS (point of sale) and
invoicing module**: turning a completed appointment into an invoice, adding
products, calculating taxes, collecting payment (including split payments,
gift cards and pre-sold packages), prorating tips, and issuing voids/refunds.

It was built against a detailed requirements document that also pointed at
[OpenSourcePOS](https://opensourcepos.org/) (PHP) as a reference for invoice
structure, tax calculation and payment handling — that project was only read
for its data-modeling logic, never run or depended on.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Drizzle ORM ·
Supabase Postgres.

> Note on language: this README, the code and its comments are in English.
> The one piece of this repo that is hardcoded in French is the disposable
> dev-harness UI (`app/page.tsx` and the components it wires together) —
> see [Using your own frontend](#using-your-own-frontend-instead-of-the-built-in-one)
> below for why, and what to do about it.

## What's implemented

All 11 deliverables from the requirements doc are done:

| # | Deliverable | Status |
|---|---|---|
| 1 | Data model (Invoice, Invoice\_items, Payment, Tax, …) | ✅ |
| 2 | Create an invoice from a completed appointment | ✅ |
| 3 | Add / modify / remove an invoice line | ✅ |
| 4 | Tax calculation from configurable tax profiles | ✅ |
| 5 | Record a payment (single or split across methods) | ✅ |
| 6 | Prorated tip calculation | ✅ |
| 7 | React checkout screen | ✅ |
| 8 | Gift card redemption (API + UI) | ✅ |
| 9 | Package/forfait redemption (API + UI) | ✅ |
| 10 | Tax settings management screen | ✅ |
| 11 | Invoice void / refund | ✅ |

Explicitly **out of scope** for this module (see
[Known limitations](#known-limitations--explicitly-out-of-scope)): a real
Square terminal integration, offline mode, multi-currency, advanced
reporting, detailed inventory, subscriptions, an online store, and store
credit (the data model reserves a `store_credit` payment method, but no
feature code issues or redeems one).

## Setup

### Prerequisites

- Node.js 20+ and npm
- No database required to start — the app runs entirely on in-memory mock
  data until you choose to connect one (see below)

### Quick start (mock data, no database)

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. You'll see a banner confirming you're in mock
mode, a list of mock appointments you can check out, the resulting mock
invoices, and a tax settings panel — all backed by in-memory arrays under
each `features/*/mock-data.ts`, reset every time the dev server restarts.

### Connecting a real Supabase database

This is the one thing the whole data layer is built around making trivial:

1. Provision a Supabase Postgres project (or any Postgres instance).
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to its
   connection string (Supabase: *Project Settings → Database → Connection
   string → "Transaction" pooler*, port 6543 — required because the pooler
   doesn't support prepared statements, which is why `db/client.ts` already
   passes `prepare: false`).
3. Apply the schema: either run `npx drizzle-kit push` (pushes `db/schema.ts`
   directly) or apply the SQL files under `drizzle/migrations/` in order
   against your database.
4. Restart `npm run dev`.

Every feature repository (`features/*/repository.ts`)
checks a single flag, `isDatabaseConfigured` (`db/client.ts`), which becomes
`true` the moment `DATABASE_URL` is set, and switches from mock arrays to
real Drizzle queries against your database. `db/schema.ts` is the single
source of truth for the schema; if you ever change it, run
`npx drizzle-kit generate` to produce a new migration file before applying it.

The other two variables in `.env.example`
(`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus
`SUPABASE_SERVICE_ROLE_KEY`) are **not used by anything in this module** —
every route in this repo talks to Postgres directly through Drizzle, never
through Supabase's client SDK or its row-level-security layer. They're only
there because `lib/supabase/client.ts` is scaffolded for the day some other
part of the app wants Supabase Auth/Storage/Realtime directly from the
browser; leave them blank unless you're wiring that up yourself.

#### One module that *won't* switch automatically: appointments

Every feature this module owns switches cleanly with `DATABASE_URL`. The one
exception is `features/appointments/`: the calendar/booking module is a
**separate, pre-existing part of the product that this repository doesn't
own and doesn't have a schema for** (see the comment at the top of
`features/appointments/types.ts`). `features/appointments/repository.ts`
always reads from its own mock data, regardless of `DATABASE_URL`, because
there's nothing else to point it at yet.

Once you know how the real calendar module exposes its appointments
(its own DB table? an internal API?), `features/appointments/repository.ts`
is the **only** file that should need to change — keep returning the same
`Appointment` shape defined in `features/appointments/types.ts`, since
`features/invoicing/repository.ts` (specifically `createInvoiceFromAppointment`)
is written against that contract, not against any particular data source.

#### One more hardcoded assumption worth knowing about

`features/taxes/calculate.ts` exports `DEFAULT_TAX_JURISDICTION`, hardcoded
to `{ country: "CA", region: "QC" }`. Every tax profile in the mock data (and
every worked example in the requirements doc) is Québec, so this is the only
jurisdiction checkout currently prices against. If the real business operates
in more than one province/country, this needs to become a real lookup (by
business location, or by customer address) instead of a constant — there's
no "business settings" table yet to drive that.

### Using your own frontend instead of the built-in one

`app/page.tsx` and the components it renders directly
(`components/CheckoutButton.tsx`, `components/TaxSettingsPanel.tsx`) are a
**disposable dev harness** — a single page that exists only so this module's
API routes could be exercised and demoed end-to-end before a real frontend
existed. It is hardcoded in French, has no routing/navigation, and is not
meant to be shipped. Once a real frontend is wired to this backend, this page
and `CheckoutButton.tsx` can simply be deleted (or left as a reference) —
nothing else in the codebase imports from `app/page.tsx`.

What *is* real, production-intended UI, built genuinely to spec rather than
as a placeholder:

- **`components/checkout/`** (`CheckoutScreen`, `LineItemsTable`,
  `TotalsSummary`, `TipControl`, `PaymentPanel`) — the complete checkout
  screen from deliverable 7, including gift card and package redemption.
  `CheckoutScreen` only needs an `initialInvoice` (an `InvoiceWithDetails`,
  typically the response of `POST /api/invoices`) and the catalog items to
  offer in its "add product" search; everything else is calls to this
  module's own API routes.
- **`components/TaxSettingsPanel.tsx`** — the complete tax-management screen
  from deliverable 10. Takes an initial `Tax[]` list and manages the rest
  itself via `/api/taxes`.

A real frontend can import either of these directly (neither depends on
`app/page.tsx`), restyle them, or use them purely as a reference for how to
call the API. Either way, **the API routes under `app/api/**` are the actual
deliverable** — any frontend, built-in or your own, is just a client of them.

One more thing a replacement frontend will need to handle itself: this
backend's enum values (invoice statuses, payment methods, appointment
statuses — see `db/schema.ts`) are English, by DB convention. The dev
harness's own French labels for them live in `utils/labels.ts` and are
hardcoded, not a real i18n system — the requirements doc's FR/EN requirement
(§3.5) was never built out as its own deliverable. `utils/currency.ts`'s
`formatCents` does take a real `Intl.NumberFormat` locale, so monetary
formatting is already genuinely locale-aware; everything else is not.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) on `http://localhost:3000` |
| `npm run build` | Production build (also type-checks) |
| `npm start` | Run a production build |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite (Vitest, one-shot) |
| `npx vitest` | Run the test suite in watch mode |
| `npx tsc --noEmit` | Type-check only |
| `npx drizzle-kit generate` | Generate a SQL migration from `db/schema.ts` |
| `npx drizzle-kit push` | Push `db/schema.ts` directly to `DATABASE_URL` (no migration file) |

### Tests

Unit tests run with [Vitest](https://vitest.dev/) (`vitest.config.ts`), live
next to the code they cover as `*.test.ts`, and never touch a real database
— everything runs against mock data, so `npm test` needs no `DATABASE_URL`
and nothing provisioned. Coverage is in three tiers:

- **Pure calculation modules** — `tax-calculation.ts`, `tip-calculation.ts`,
  `checkout-view.ts`'s aggregations, `utils/currency.ts`. No mocking; inputs
  in, numbers out, several checked directly against the requirements doc's
  own worked examples.
- **Invoicing repository business rules**, in mock mode — the invoice
  status-transition guards, split payments and overpay rejection, void/
  refund across every status, gift card and package redemption (balance/
  quantity/expiry/customer-mismatch edge cases), and the already-redeemed
  line lockout. Repository functions mutate shared in-memory mock arrays in
  place, so each relevant `features/*/mock-data.ts` exports a test-only
  `resetMockX()` (snapshot-and-restore via `structuredClone`), called from
  `beforeEach` to keep test cases isolated from one another.
- **A representative sample of route handlers** — not all of them, since the
  tier above already covers the business logic they delegate to. Next.js
  route handlers are just functions, so these call the exported
  `GET`/`POST` directly with a constructed `Request`, no running server
  needed, to verify request validation and error→HTTP-status mapping.

There's no component-level UI testing yet (`CheckoutScreen` and friends) —
that would need jsdom and Testing Library, which isn't set up here.

## Architecture

```
db/schema.ts              Single source of truth for the schema (Drizzle).
                           Run `drizzle-kit generate` after editing it.
db/client.ts               isDatabaseConfigured + getDb() — the one switch.
drizzle/migrations/        Generated SQL migrations, in order.

features/<domain>/
  types.ts                 Row types inferred straight from db/schema.ts.
  errors.ts                 Domain error classes (one per failure mode),
                            thrown by repository.ts, mapped to HTTP status
                            by the route handlers.
  mock-data.ts              In-memory seed data + lookup helpers.
  repository.ts             All reads/writes. Every function branches on
                            isDatabaseConfigured: mock array vs real
                            Drizzle query. This is the ONLY layer that
                            knows about mock vs real.

app/api/**/route.ts         Thin controllers: parse/validate the request,
                            call a repository function, map thrown domain
                            errors to HTTP status (404 not found, 422
                            business-rule conflict, 400 validation, 409
                            true duplicate).

components/checkout/*       Real checkout UI (deliverable 7), composed by
                            CheckoutScreen. Presentational — all state and
                            network calls live in CheckoutScreen itself.
components/TaxSettingsPanel.tsx   Real tax-management UI (deliverable 10).
```

Conventions enforced throughout:

- **Money is always integer cents** (`unitPriceCents`, `totalCents`, …);
  **rates are always integer micros of the decimal fraction**, divisor
  1,000,000 (9.975% ⇒ `rateMicros: 99750`). Public API inputs accept a
  human `ratePercent`/`percent` and convert at the boundary.
- **Snapshot principle**: an invoice line copies the service/product name,
  price and tax rate at the moment it's added. A later catalog or tax-rate
  change must never rewrite an existing invoice's history.
- **Never trust a running total** — invoice totals, "paid so far" and
  "refunded so far" are always resummed from the underlying rows
  (`invoice_items`, `payments`, `refunds`) rather than incremented, so a
  missed update can never leave a stale total lying around.
- **Immutability of closed invoices**: once an invoice has taken a real
  payment (`partially_paid`/`paid`) its lines can no longer be edited; once
  `paid`/`refunded`/`voided`, nothing about it changes except through a
  payment, a refund, or a void — never a direct edit.
- **Row locking for atomicity**: operations that touch a shared balance
  (recording a payment, redeeming a gift card or package, refunding) lock
  the relevant row(s) with `SELECT ... FOR UPDATE` inside one transaction,
  so two concurrent requests can never both read the same "before" balance.

## API reference

All routes live under `app/api/`. Errors are returned as `{ "error": string }`
with an appropriate status code (400 validation, 404 not found, 409 true
duplicate, 422 business-rule conflict).

**Invoices**
| Method & path | Purpose |
|---|---|
| `POST /api/invoices` | Create a draft invoice from a completed appointment |
| `POST /api/invoices/:id/items` | Add a line (product/service) |
| `PATCH /api/invoices/:id/items/:itemId` | Update a line's quantity/discount |
| `DELETE /api/invoices/:id/items/:itemId` | Remove a line |
| `PATCH /api/invoices/:id/tip` | Set/replace the invoice's tip (prorated across lines) |
| `POST /api/invoices/:id/payments` | Record a payment (one of possibly several, for split payment) |
| `POST /api/invoices/:id/gift-card-redemptions` | Redeem a gift card against the balance |
| `GET /api/invoices/:id/eligible-packages` | List lines a customer's active package(s) can cover |
| `POST /api/invoices/:id/items/:itemId/redeem-package` | Redeem a package against one line |
| `POST /api/invoices/:id/void` | Void a never-paid invoice |
| `POST /api/invoices/:id/refunds` | Refund a paid/partially-paid invoice (partial or full) |
| `GET /api/invoices/:id/refunds` | List refunds issued against an invoice |

**Taxes**
| Method & path | Purpose |
|---|---|
| `GET /api/taxes` | List every tax profile (active and inactive) |
| `POST /api/taxes` | Create a tax profile |
| `PATCH /api/taxes/:id` | Update any field of a tax profile, including `active` |
| `POST /api/taxes/calculate` | Calculate taxes for an ad-hoc line, without an invoice |

**Gift cards & packages**
| Method & path | Purpose |
|---|---|
| `GET /api/gift-cards/:code` | Look up a gift card's balance/status by code |
| `POST /api/gift-cards` | Issue a gift card (minimal — issuance isn't a deliverable itself) |
| `POST /api/packages` | Issue a package (minimal, same reasoning) |

## Known limitations

Per the requirements doc's own scoping, these were deliberately left out of this module:

- No physical payment terminal integration (Square recorded as a payment
  method, no real Square API call)
- No offline mode
- No multi-currency (architecture doesn't block it, but it's not active —
  `formatCents` takes a currency code, nothing else is currency-aware)
- No advanced reporting (commissions, sales trends, etc.)
- No detailed inventory management
- No recurring subscriptions
- No online storefront
- `store_credit` is a reserved payment-method value with no issuing/redeeming
  feature behind it

And, as covered above: no real i18n system, appointments/calendar data is a
mock stand-in pending the real module's contract, and tax jurisdiction is
hardcoded to Québec.
