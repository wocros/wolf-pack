# Database — Utility Bill Guardian

This folder contains the database structure for the Utility Bill Guardian system.
BPM uses this to track utility bills across all properties where BPM pays utilities
on behalf of property owners.

---

## Tables

### `utility_vendors`
The utility companies BPM deals with — SDG&E, the City of San Diego, Republic
Services, and so on. One row per company. You set these up once and then link
individual accounts to them. This table does not store account numbers — just the
company-level info (name, type of utility, phone, portal URL).

### `utility_accounts`
Each row is one utility account number tied to one specific property. For example,
the SDG&E account for 110 W Robertson is one row; the water account for the same
address is a separate row. This table links a property (by its AppFolio ID) to a
vendor, and stores the account number, owner name, and billing cycle. When an
account is closed, flip `active` to false — never delete the row.

### `utility_bills`
Every bill that comes in for any utility account. One row = one invoice. Tracks
the statement date, due date, billing period, how much was owed, how much was paid,
whether there was a late fee, and where the PDF is stored. The `status` field tells
you where the bill stands: `received`, `paid`, `overdue`, or `missing`.

### `utility_outreach`
When a bill is missing for a billing period, this table tracks the outreach email
to the utility company — the draft text, whether it was approved, when it was sent,
and whether the vendor responded. One row = one outreach attempt for one missing
billing period on one account. Emails are never sent automatically — a person must
approve and send.

---

## Two keys you need

This system uses two different Supabase keys, and it matters which is which:

| Key | Used by | What it can do |
|---|---|---|
| **Anon key** | `dashboard.html` (browser) | Read only — cannot write anything |
| **Service role key** | Node scripts (`run-checks.js`, `ingest-bill.js`, etc.) | Read and write — full access |

Both keys are in your Supabase project under **Settings > API > Project API keys**.

Add both to your `.env` file:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Never put the service role key in `dashboard.html`.** It would give any browser full write access to your database.

---

## How to find vendor IDs after seeding

When you add a utility account (via `add-account.js`), you need the vendor's ID (a unique code that Supabase generates). After running the seed, look them up with this SQL in the Supabase SQL Editor:

```sql
SELECT id, name FROM utility_vendors ORDER BY name;
```

Copy the `id` for the vendor you want and use it when calling `addUtilityAccount({ vendorId: '...' })`.

---

## How to run the migration

### Option A — Supabase Dashboard (recommended for first-time setup)

1. Log in to your Supabase project at https://app.supabase.com
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Run the three migration files in order — one at a time, same steps each:
   - `src/db/migrations/001_create_utility_bill_guardian.sql` — creates the four tables
   - `src/db/migrations/002_add_rls_utility_bill_guardian.sql` — locks down permissions
   - `src/db/migrations/003_add_outreach_unique_constraint.sql` — prevents duplicate drafts
5. Click **Run** after each one.
6. You should see "Success. No rows returned." — that means it worked.

### Option B — psql command line

```bash
psql "$DATABASE_URL" -f src/db/migrations/001_create_utility_bill_guardian.sql
psql "$DATABASE_URL" -f src/db/migrations/002_add_rls_utility_bill_guardian.sql
psql "$DATABASE_URL" -f src/db/migrations/003_add_outreach_unique_constraint.sql
```

Replace `$DATABASE_URL` with your Supabase connection string (found in your
Supabase project under Settings > Database > Connection string > URI).

---

## How to run the seed (starter vendor data)

Run this **after** the migration. It inserts the 6 common San Diego utility vendors.
It is safe to run more than once — it will skip rows that already exist.

### Option A — Supabase Dashboard

1. Click **SQL Editor** > **New query**
2. Open `src/db/seeds/001_utility_vendors_seed.sql`, copy, paste, and click **Run**

### Option B — psql command line

```bash
psql "$DATABASE_URL" -f src/db/seeds/001_utility_vendors_seed.sql
```

---

## How to roll back (undo the migration)

At the bottom of `001_create_utility_bill_guardian.sql` there is a **ROLLBACK**
comment block. Copy those `DROP TABLE` statements (without the `--` comment
markers) and run them in the SQL Editor. This will remove all four tables and the
trigger function. **All data in those tables will be permanently deleted.** Only
do this in a test environment or if you are starting over.
