# MX Summit Track — Your Property Meld Data Can Run Your Maintenance Department

### Two 40-minute sessions. One tool. Built live, in the room, by you.

---

Property Meld already has everything your maintenance department needs to know:
every request, every vendor, every appointment, every cost, every tenant rating.
It's sitting in there. Nobody has time to read it.

In Session 1, you pick a build, hand a prompt to Claude Code, and watch it write
a small tool that reads your Property Meld data and tells you what to do this
morning. In Session 2, you point that same tool at your live account and put it
on a schedule.

You do not need to know how to code. You need to know your maintenance business.
You already do.

---

## What You Need

- **A laptop** (not a tablet — you'll want a real keyboard)
- **Claude Code** installed — [claude.ai/download](https://claude.ai/download)
- **This repo** on your laptop:
  ```
  git clone https://github.com/wocros/wolf-pack.git
  cd wolf-pack
  ```
  (Forking first is fine too. Either way, you're working in the `mx-summit/` folder.)
- **Python 3.11 or newer** — it's already on most Macs. On Windows, get it from
  python.org and tick "Add to PATH" during install.

Nothing else. No server, no database, no Property Meld credentials for Session 1.
The sample data is already in the folder.

**Quick check that everything works** — from the `wolf-pack` folder:
```
python3 mx-summit/pm_reader.py
```
You should see counts: 115 melds, 7 vendors, 9 properties, 6 owners. If you do,
you're ready.

---

## Session 1 — Pick a Build, Paste a Prompt, Run It

The room votes on one of three builds. Then everyone builds it at the same time.
About 21 minutes of build time. Here's the flow:

**Step 1 — Pick a blueprint.**

| # | Blueprint | What it does for you |
|---|-----------|----------------------|
| 07 | [Daily Coordinator Briefing](blueprints/07-daily-coordinator-briefing.md) | Every morning: what's overdue, what's unassigned, who's on site today, which vendor to call |
| 08 | [Owner Work-Order Summary](blueprints/08-owner-work-order-summary.md) | A plain-English email draft to the owner for every job completed yesterday |
| 09 | [Vendor Scorecard](blueprints/09-vendor-scorecard.md) | Rank your vendors on speed, ratings, cost accuracy, and cancellations |

**Step 2 — Paste the prompt.**

Open Claude Code in the `wolf-pack` folder. Open the blueprint. Copy everything
under "Hand This to Jarvis." Paste it. Hit enter.

Claude will tell you what it plans to build and ask you to approve. Read the
plan. Say yes, or tell it what to change. Then it builds.

**Step 3 — Run it against the sample export.**

Claude will give you a command like `python3 mx-summit/my_briefing.py`. Run it.
Read the output. Then ask for changes the way you'd ask a new hire: "put
emergencies at the top," "add the tenant's name," "make it shorter."

That's the whole session. If you finish early, build a second one.

**Stuck? Or just want to see a finished one?** The `solutions/` folder has a
working version of all three, and the `solution/mx-summit` branch has the same
files. `solutions/README.md` shows what good output looks like.

---

## Session 2 — Wire It to Live Data and Put It on a Schedule

Same tool. Now it reads your real Property Meld account instead of the sample
CSV, runs itself every morning, and follows a few rules so it can't cause harm.

Three moves:

1. **Swap CSV for live API.** Copy `.env.example` to `.env`, add your Property
   Meld API credentials, set `PM_MODE=api`. Nothing else in your tool changes.
2. **Put it on a schedule.** Cron on your Garage server, or a GitHub Actions
   workflow — there's an example you can copy.
3. **Add the rails.** Read-only. Drafts, not sends. A human approves anything
   that goes to an owner or tenant. Every run logged.

Full walkthrough: [`session2/README.md`](session2/README.md)

---

## If You Get Stuck

Most problems in the room are one of the ten in
[`setup/getting-unstuck.md`](../setup/getting-unstuck.md). Check there first.

The one that comes up most: Claude goes in circles. Start a new session and paste:

> Read mx-summit/AGENTS.md, then tell me what you understand about this folder
> before we continue.

---

## Bringing Your Own AI Agent?

Some of you use Cursor, Codex, or something else instead of Claude Code. That's
fine. Point it at [`AGENTS.md`](AGENTS.md) in this folder. It explains where the
data is, what the blueprints are, and the rules (read-only, no sending, ask
before you build). Any decent coding agent will follow it.

---

## What's in This Folder

```
mx-summit/
  README.md            ← you are here
  AGENTS.md            ← instructions for any AI coding agent
  pm_reader.py         ← reads Property Meld data (sample CSV or live API)
  .env.example         ← copy to .env for Session 2 credentials
  data/                ← the synthetic Property Meld export + the script that made it
  blueprints/          ← the three paste-in prompts
  solutions/           ← working reference builds
  session2/            ← live API, scheduling, governance rails
  out/                 ← where your tools write their output (not committed)
```

All the data is invented. "Blue Ridge Property Management" is not a real company
and nobody in the CSVs is a real person.
