# Blueprint 07 — Daily Coordinator Briefing

**The problem:** Your maintenance coordinator opens Property Meld at 8am and sees
a wall of melds. Forty open. Which ones are on fire? Which ones have been sitting
with no vendor for two weeks? Who's actually showing up today? They scroll, they
guess, they miss one — and that's the one the tenant calls the owner about.

**What this builds:** A one-page morning briefing, written to a file, that reads
every open meld and sorts it into what matters: overdue by priority, unassigned,
scheduled today, waiting on sign-off, and a list of which vendors to call. The
coordinator reads it with their coffee and knows what to do first.

**Time to build:** About 20 minutes

**What to have ready:** Nothing — the sample data is in `mx-summit/data/`.
For Session 2 you'll want your Property Meld API credentials.

---

## Hand This to Jarvis

*Open Claude Code in the `wolf-pack` folder. Copy everything below the line.
Paste it. Hit enter.*

---

Read mx-summit/AGENTS.md first and follow its rules.

I want to build a daily morning briefing for my maintenance coordinator from
Property Meld data.

Here's the problem: every morning there are 30–50 open maintenance requests and
the coordinator has to scroll through all of them to figure out which ones
actually need attention today. Things get missed.

Here's exactly what I want it to do:

1. Read every meld using mx-summit/pm_reader.py (use its as_of() as "today")
2. Treat PENDING_ASSIGNMENT, OPEN, and PENDING_COMPLETION as "open"
3. Write a markdown briefing to mx-summit/out/ with these sections, in this order:
   - Overdue: open melds past their due date, sorted EMERGENCY → HIGH → MEDIUM → LOW,
     then oldest first. Show the meld number, what it is, the address, how many
     days old, and the vendor if there is one
   - Unassigned: open melds with no vendor yet
   - Scheduled today: appointments happening today, in time order
   - Waiting on sign-off: melds in PENDING_COMPLETION
   - Vendor callouts: for each vendor holding overdue jobs, one line saying how
     many and which ones, so the coordinator knows who to call
   - Everything else that's open
4. Put a one-line summary at the top: total open, overdue, unassigned,
   scheduled today, completed in the last 24 hours
5. Print the briefing to the screen too, so I can see it without opening the file

Keep it to one Python file in mx-summit/, standard library only, no sending
anything anywhere. Just read the data and write the file.

Please tell me what you're going to build before you write anything. I want to
approve the plan first.

---

## After the Build

Run it every morning before the coordinator starts:
```
python3 mx-summit/daily_briefing.py
```
Open the file in `mx-summit/out/`. Work the sections top to bottom.

Things people ask for next: "add the tenant's name," "flag anything over 14 days
in red," "show me only my properties." Just ask.

**Result:** The coordinator starts every day knowing the five things that matter
instead of scrolling past forty things that might.

---

## Session 2 note

This is the build that gets scheduled. In Session 2 you switch `pm_reader` to
`api` mode so it reads your real account, run it on a cron at 7:30am, and have
it drop the briefing somewhere the coordinator already looks — a shared folder,
or a Slack channel via a webhook. Posting a briefing to your *own internal*
channel is a safe first automation: nothing goes to a tenant or owner. See
[`../session2/README.md`](../session2/README.md).
