# Deploying BillFlow

Everything below is copy-pasteable. Nothing in this file contains a real
credential — where one is needed it says which line of your local `.env.local`
to copy it from.

Current state: the repo is committed locally on `main` (2 commits, 189 files),
the Supabase database is already migrated and seeded, and `npm run build`
passes.

---

## 1 — GitHub

Create the repository in the browser at <https://github.com/new>:

- **Name:** `billflow`
- **Visibility:** Public
- Do **not** add a README, `.gitignore` or licence — the repo already has them.

Then push (replace `<your-username>`):

```bash
cd /d/mycpeone_assignment && git remote add origin https://github.com/<your-username>/billflow.git && git push -u origin main
```

Git will open a browser window to authenticate the first time.

---

## 2 — Vercel

Import the repo at <https://vercel.com/new>. Vercel detects Next.js on its own,
so leave the build and output settings untouched.

Before clicking **Deploy**, open **Environment Variables** and add these four.
Copy the values from your local `.env.local` — same file, same lines.

| Name | Value |
|---|---|
| `DATABASE_URL` | The Supabase **session pooler** string from `.env.local`. Host must be `aws-0-ap-southeast-1.pooler.supabase.com:5432` — the direct `db.<ref>.supabase.co` host is IPv6-only and Vercel cannot reach it. |
| `SESSION_SECRET` | The 64-character hex string from `.env.local`. |
| `RESEND_API_KEY` | The `re_…` key from `.env.local`. |
| `EMAIL_FROM` | `BillFlow <onboarding@resend.dev>` |

Apply each to **Production, Preview and Development**. Then **Deploy**.

`NEXT_PUBLIC_APP_URL` is deliberately not in that list: `appUrl()` falls back to
`VERCEL_PROJECT_PRODUCTION_URL`, which Vercel injects, so share links point at
the deployed origin with no extra configuration. Once you know the final URL you
can set it explicitly to pin it:

```bash
npx vercel env add NEXT_PUBLIC_APP_URL production
```

Share links do not need re-seeding after deploy. Only the token is stored in the
database; the origin is built at render time.

---

## 3 — Verify

Replace `<app>` with your deployed origin.

```bash
curl -s -o /dev/null -w "landing %{http_code}\n" https://<app>/
```

```bash
curl -s -o /dev/null -w "anon dashboard %{http_code} (expect 307)\n" https://<app>/dashboard
```

Get a live share token, then open the public page:

```bash
cd /d/mycpeone_assignment && npm run db:inspect
```

```bash
curl -sI "https://<app>/i/<token>" | grep -iE "^HTTP|x-robots-tag|cache-control"
```

Expect `200`, `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`, and
`Cache-Control: no-store`. A made-up token must return `404`.

Then, in the browser: sign in as `demo@billflow.app` / `Billflow@123`, open a
sent invoice, copy its share link, open it in a private window, and pay it. The
receipt should appear without a reload.

---

## 4 — If you ever rebuild the database

The migrations build the schema from empty, so a fresh Postgres needs only:

```bash
DATABASE_URL="<connection-string>" npm run db:setup
```

To wipe and reload the demo data on an existing database:

```bash
DATABASE_URL="<connection-string>" npm run db:reset
```

Optionally lock down Supabase's auto-generated REST API — enables row-level
security and revokes the `anon` / `authenticated` grants, so no table is
reachable except through this app's own pooled connection:

```bash
DATABASE_URL="<connection-string>" npm run db:optional
```

`npm run db:inspect` prints the RLS state per table so you can confirm it took.

---

## 5 — After the review, rotate these

Both passed through an AI chat session, so treat them as disclosed:

- The Supabase **service-role** key (`sb_secret_…`) — Supabase dashboard →
  Project Settings → API → *Rotate*. BillFlow never uses it; it connects with
  the pooled Postgres password only.
- The **Resend** API key — <https://resend.com/api-keys> → revoke and re-issue.
- The Supabase **database password**, if you want to be thorough — rotating it
  means updating `DATABASE_URL` on Vercel and locally.

Neither key is in the repository. `.env.local` and every `.env*.local` variant
are listed in `.gitignore`, and the staged file list was checked against those
patterns before the first commit.


