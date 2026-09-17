# Instructions for AI Coding Agents

You are helping a property manager who is **not a developer** build a small
maintenance tool from Property Meld data. Read this whole file before doing
anything. It is short.

## What this folder is

`mx-summit/` is a self-contained workshop track. Everything a build needs is in
here. You do not need to look anywhere else in the repository, and you should
not modify anything outside this folder.

## Where the data is

- `data/melds.csv` — 115 maintenance requests ("melds") over 90 days
- `data/vendors.csv`, `data/properties.csv`, `data/owners.csv`
- `data/README.md` — what every column means and how it maps to Property Meld's API

**Read the data through `pm_reader.py`, not by opening the CSVs directly.**
It exposes four functions — `load_melds()`, `load_vendors()`,
`load_properties()`, `load_owners()` — each returning a list of dicts. Use
`pm_reader.as_of()` as "today" (never `datetime.now()` directly) so the sample
data stays consistent. `pm_reader.parse_dt()` and `pm_reader.to_float()` handle
blanks. The same code works against the live API later by setting `PM_MODE=api`.

All data here is synthetic. No real people or companies.

## The three blueprints

| # | File | Builds |
|---|---|---|
| 07 | `blueprints/07-daily-coordinator-briefing.md` | Morning briefing markdown: overdue, unassigned, scheduled today, vendor callouts |
| 08 | `blueprints/08-owner-work-order-summary.md` | One owner email DRAFT file per meld completed in the last 24h |
| 09 | `blueprints/09-vendor-scorecard.md` | Ranked vendor table: jobs, days to complete, rating, cost variance, cancel rate |

Reference implementations are NOT in this folder. They live on the
`solution/mx-summit` branch, deliberately, so the user builds theirs first.
Do not fetch them unless the user asks — they are here to see it built.

## Constraints

- **Python 3.11, standard library only.** No pip installs. No pandas.
- **Read-only against Property Meld.** Never write code that sends a POST, PUT,
  PATCH, or DELETE to Property Meld, and never modify `pm_reader.py` to do so.
- **Never send email, SMS, Slack messages, or anything else.** Tools here
  produce files. A human reads the file and decides what to send.
- **Write all output to `mx-summit/out/`** (create it if missing). It is
  gitignored. Never write into `data/`.
- **Never read, print, or commit `.env`.** Credentials come from
  `.env.example` → `.env`, which the user fills in themselves.
- **Keep it small.** One file per build, under ~150 lines, plain functions,
  comments in plain English. If the user can't read it, it's too clever.
- **Put the new file in `mx-summit/`** (e.g. `mx-summit/my_briefing.py`), and
  make it runnable with `python3 mx-summit/<file>.py` from the repo root.

## Ask before you build

Before writing any code, tell the user in one short paragraph — plain English,
no jargon — what you are going to build and what the output will look like.
Wait for a yes. If the user says "just build it," give the one-paragraph plan
anyway and ask once.

After it runs, show the user the output and ask what they'd change. Iterate on
their words, not on your idea of better.

## When something breaks

Read the error out loud in plain English, say what you think it means, and
propose one fix at a time. Do not rewrite the whole file to fix one line.
