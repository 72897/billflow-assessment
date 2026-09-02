# BillFlow

Invoicing for freelancers and small studios. Create a client, build an invoice,
send it as a link, and get paid — without the client needing an account.

Built as a full-stack technical assessment: Next.js 15 App Router, React 19,
TypeScript (strict), Tailwind, and PostgreSQL with real migration files.

---

## Live demo

| | |
|---|---|
| **App** | _fill in after deploying — see [DEPLOY.md](DEPLOY.md)_ |
| **Demo login** | `demo@billflow.app` / `Billflow@123` |
| **Public invoice link** | `/i/<token>` — printed by `npm run db:seed`, also copyable from any sent invoice |

The seeded account opens on a dashboard with real history: 6 clients, 14
invoices across draft / sent / paid / overdue, 8 recorded payments and a
49-event audit trail. At least one invoice is already sent, so the public
pay-without-login page can be opened straight away.

---

## What's built

**Landing page** — `/` explains the product, shows the invoice UI, and links to
sign-up. Fully responsive.

**Accounts** — email + password sign-up and login. Passwords are bcrypt-hashed
(cost 10). Sessions are random 32-byte tokens stored as SHA-256 digests in
Postgres and carried in an httpOnly, SameSite=Lax cookie, so signing out revokes
access server-side immediately. Every query is scoped by `user_id` in its `WHERE`
clause, so another user's row and a deleted row are indistinguishable.

**Clients** — full CRUD with a detail page showing that client's invoice history
and totals. Archive instead of hard delete when a client already has invoices,
with restore.

**Invoices** — unlimited line items, live totals as you type, per-invoice tax
rate and discount (fixed amount or percentage), notes, payment terms. Statuses
are `draft` / `sent` / `paid`, and **overdue is derived, never stored** — a
`invoice_display_status()` SQL function and its TypeScript twin both compute it
from `due_date` and `status`, so an invoice becomes overdue on its own with no
cron job and no one clicking anything.

**Invoice list** — search, status filter, client filter and sorting, all executed
**in SQL on the server** and driven by URL search params, so every view is
linkable and shareable. Paginated.

**PDF + print** — every invoice downloads as a real PDF generated server-side
with `@react-pdf/renderer`, and the on-screen invoice has its own print
stylesheet (A4, 14 mm margins, chrome stripped) so Ctrl-P produces the same
document.

**Sending** — send by email or copy a shareable link. Email has three transports
behind one function, picked by what is configured: SMTP (nodemailer — a plain
mailbox, so it reaches any recipient), Resend, or a built-in file "outbox" that
writes the message to `./.mail/*.html` so the flow is fully demonstrable with no
email account at all. A refusal that a retry cannot fix — a wrong app password,
an unverified sending domain — degrades to the outbox and reports why, rather
than offering a retry button that would hit the identical refusal; a timeout or a
rate limit still fails loudly, because there retrying is exactly right. Reminders
can be re-sent on overdue invoices.

**Public invoice page** — `/i/<token>` renders the invoice to anyone with the
link, no account and no session. It can be paid there (simulated card / bank
transfer), which writes a payment, flips the invoice to paid, emails a receipt,
and shows a downloadable receipt. Double-submits are absorbed by an idempotency
key; a stale tab that posts an out-of-date total is rejected rather than
under-charging. Revoking a link (nulling `public_token`) turns the page into a
404 immediately.

**Dashboard** — earned / outstanding / overdue totals with a month-on-month
comparison, an income chart (Recharts) switchable between this month, last 30
days, this year and last 12 months, recent invoices, and a "needs attention"
list of what to chase.

**Settings** — business name, address, contact details, logo upload, currency
(8 supported) and invoice-number prefix. All of it flows onto the invoice, the
PDF and the public page. Invoice numbers are allocated by a Postgres function
holding a row lock, so two invoices created at the same instant cannot collide.

**Everywhere** — loading skeletons (`loading.tsx` per route), empty states with a
next action, error boundaries, optimistic-free `router.refresh()` after
mutations, keyboard-accessible dialogs, and a layout that works from 360 px up.

---

## Local setup

Requires Node 20+. **No database installation needed** — if `DATABASE_URL` is
blank, BillFlow falls back to [PGlite](https://pglite.dev), a real PostgreSQL
engine compiled to WebAssembly that keeps its data in `./.pgdata`. The same SQL
migrations run in both modes.

```bash
git clone <this-repo> && cd billflow
npm install
cp .env.example .env.local     # works as-is for local dev
npm run db:setup               # migrate + seed
npm run dev                    # http://localhost:3000
```

`npm run db:setup` prints the demo login and a ready-to-open public invoice link
at the end.

To run against a real Postgres instead, put its connection string in
`DATABASE_URL` and re-run `npm run db:setup`.

---

## Environment variables

Copy `.env.example` to `.env.local`. **No real credentials are committed to this
repository** — `.env.local` and every `.env*.local` variant are in `.gitignore`,
and `.env.example` contains only placeholders.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Production only | Postgres connection string. Blank locally → PGlite. |
| `SESSION_SECRET` | Yes | 32+ random bytes. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public origin used to build share links and email links. Must be the deployed origin in production, or share links will point at localhost. |
| `SMTP_USER` / `SMTP_PASSWORD` | No | Mailbox used to send. The recommended setup: a plain mailbox reaches any recipient. With Gmail the password must be a [16-character app password](https://myaccount.google.com/apppasswords), not the account password. `EMAIL` / `EMAIL_PASSWORD` are accepted as aliases. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | No | Default to `smtp.gmail.com`, `465` and implicit TLS. For port 587 set `SMTP_SECURE=false` (STARTTLS). |
| `RESEND_API_KEY` | No | Used when no SMTP mailbox is set. An account without a verified domain may only deliver to the address that owns it — BillFlow treats that as permanent and captures to the outbox. |
| `EMAIL_FROM` | No | Sender identity, e.g. `BillFlow <invoices@yourdomain.com>`. Under SMTP the authenticated mailbox always wins (servers reject or rewrite an address you have not signed in as), so only the display name is used. |
| `SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD` | No | Credentials `npm run db:seed` creates. |

With none of the email variables set, nothing is lost and nothing is faked: each
message is written to `./.mail/<timestamp>.html` with its envelope at the top, the
subject is logged, and the UI says plainly that the invoice is sent and its
payment link is live but no email left the building.

---

## Database

Migrations are plain, numbered, idempotent SQL files applied in order and
recorded in a `_migrations` table, so they build the schema from an empty
database:

```
db/migrations/0001_init.sql              tables, indexes, constraints, triggers
db/migrations/0002_functions.sql         invoice_display_status, allocate_invoice_number, peek_invoice_number
db/migrations/optional/0003_optional_rls.sql       row-level security policies
db/migrations/optional/0004_supabase_lockdown.sql  revoke anon/authenticated grants
```

| Command | Effect |
|---|---|
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load the demo account, clients, invoices, payments, events |
| `npm run db:setup` | Both of the above |
| `npm run db:reset` | Drop everything, then migrate + seed |
| `npm run db:optional` | Apply the optional RLS / lockdown migrations |
| `npm run db:inspect` | Print tables, row counts, functions, RLS state, demo login and live share tokens |

Money is stored as `numeric(14,2)` and handled in TypeScript as integer minor
units — never a float. Tax rates are basis points, quantities thousandths.
Totals are always recalculated on the server from the line items; a client-sent
total is only ever used as an optimistic-concurrency check.

---

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — 122 tests across calc, money, validation, invoices, clients, settings, auth |

The test suite runs against a throwaway PGlite database, so it needs no
services. Integration coverage includes double-pay idempotency, stale-total
rejection, share-token revoke/regenerate, per-user isolation, and overdue
derivation.

---

## Architecture

```
src/app/(app)/       authenticated screens — dashboard, clients, invoices, settings
src/app/(auth)/      login, signup
src/app/i/[token]/   the public invoice — no session, no sidebar, no sign-up wall
src/app/api/         25 route handlers (all mutations)
src/components/      ui primitives, plus feature folders (invoices, clients, dashboard, public)
src/lib/repositories one module per aggregate; every query takes a userId
src/lib/validation/  zod schemas shared by client forms and server handlers
src/lib/{money,invoice,pdf,email,db}
db/migrations/       numbered SQL
scripts/             migrate, seed, reset, inspect
tests/               unit + integration
```

Server components read repositories directly; client components mutate through
`/api/*` and then call `router.refresh()`. The same zod schema validates a form
in the browser and the payload on the server, so error messages match without
being written twice.

`src/middleware.ts` runs on the Edge and does one cheap thing: bounce visitors
with no session cookie away from protected paths. It is explicitly *not* the
authority — every protected page still calls `requireUserPage()`, which hits the
sessions table. Because the Edge runtime cannot load `node:crypto` or the
Postgres driver, the cookie name lives in its own zero-import module
(`src/lib/auth/cookie.ts`).

---

## Deployment

Deployed on Vercel with Supabase Postgres. **[DEPLOY.md](DEPLOY.md) has the
copy-pasteable version**; the outline is:

1. Push to GitHub and import the repo on Vercel.
2. Create a Supabase project. From **Connect → Session pooler** copy the
   connection string (the pooler resolves over IPv4; the direct
   `db.<ref>.supabase.co` host does not, which Vercel's build network needs).
3. Set the environment variables on Vercel: `DATABASE_URL`, `SESSION_SECRET`,
   and — for real email — `SMTP_USER` / `SMTP_PASSWORD` (or `RESEND_API_KEY`)
   plus `EMAIL_FROM`. `NEXT_PUBLIC_APP_URL` is optional on Vercel — `appUrl()`
   falls back to `VERCEL_PROJECT_PRODUCTION_URL` so share links resolve to the
   deployed origin either way.
4. Run the migrations and seed once against the hosted database:
   ```bash
   DATABASE_URL="<session-pooler-url>" npm run db:setup
   ```
5. Optionally `npm run db:optional` to enable row-level security and revoke the
   `anon` / `authenticated` grants, so Supabase's auto-generated REST API cannot
   reach any table. Verify with `npm run db:inspect`.

Only the share *token* is stored in the database, never a full URL, so moving
between origins does not invalidate a link.

---

## Security notes

- Passwords bcrypt-hashed; sessions stored as SHA-256 digests, so a database dump
  cannot be replayed as a login.
- Ownership is enforced in SQL, not in application `if` statements.
- Share tokens are 24 random bytes, compared in constant time, and revocable.
  `/i/*` and `/api/public/*` send `X-Robots-Tag: noindex, nofollow, noarchive,
  nosnippet` and `Cache-Control: no-store`, so a bearer link is never indexed or
  cached. A dead, revoked, or draft link all render the same 404 — the wording
  never reveals which, so live tokens cannot be probed.
- Auth, public, email and upload endpoints are rate-limited per IP.
- Logo uploads are validated on MIME type (PNG / JPEG / WebP / SVG) and size
  (2 MB) before being written.
- Totals are recalculated server-side on every write.
- No credentials in the repository; `.env*.local` is ignored.

## Simulated payment

Paying on the public page does not contact a payment processor and collects no
card details — it records a payment with a reference, marks the invoice paid and
issues a receipt. This is stated on the page itself so a reviewer is never
misled. Swapping in a real processor means replacing one repository call.




