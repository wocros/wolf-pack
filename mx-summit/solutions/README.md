# Reference Solutions

Working versions of all three blueprints. Each one imports `../pm_reader.py`,
reads the sample export, and writes to `mx-summit/out/`. Run any of them from
the `wolf-pack` folder:

```
python3 mx-summit/solutions/daily_briefing.py
python3 mx-summit/solutions/owner_summaries.py
python3 mx-summit/solutions/vendor_scorecard.py
```

The same three files are on the `solution/mx-summit` branch. They are here so
you can compare, not so you can skip the build — the point of the session is
watching Claude build yours from your words.

Set `PM_MODE=api` (see `../session2/README.md`) and they read your live account
instead, with no code changes.

---

## What good looks like

The first ~15 lines of each, run against the sample data.

### daily_briefing.py

```
# Maintenance Briefing — Tuesday, September 22, 2026

**42 open** · 30 overdue · 12 unassigned · 4 scheduled today · 11 completed in the last 24h

## 1. Overdue (deal with these first)

- **EMERGENCY** #7022 — AC not cooling (1201 Harbor View Blvd Unit 1, Asheville, NC 28804) — 25 days old — Mountain Air Heating & Cooling
- **EMERGENCY** #7096 — Outlet in bedroom not working (300 Laurel Park Ave Unit 3, Hendersonville, NC 28739) — 24 days old — Ridgeline Maintenance Crew
- **EMERGENCY** #7051 — Outlet in bedroom not working (1520 Cedar Ridge Rd Unit 5, Hendersonville, NC 28791) — 18 days old — Ridgeline Maintenance Crew
- **EMERGENCY** #7084 — Front door lock sticking (1520 Cedar Ridge Rd Unit 4, Hendersonville, NC 28791) — 17 days old — Handy Hank Home Repair
- **HIGH** #7059 — Front door lock sticking (27 Hilltop Ln Unit 2, Weaverville, NC 28787) — 26 days old — Ridgeline Maintenance Crew
- **HIGH** #7099 — Ceiling stain in bathroom (1201 Harbor View Blvd Unit 3, Asheville, NC 28804) — 16 days old
- **HIGH** #7058 — Thermostat screen blank (9 Old Mill St Unit 1, Asheville, NC 28801) — 16 days old
- **HIGH** #7100 — Breaker keeps tripping (300 Laurel Park Ave Unit 2, Hendersonville, NC 28739) — 13 days old
- **HIGH** #7005 — Closet door off track (27 Hilltop Ln Unit 2, Weaverville, NC 28787) — 11 days old — Handy Hank Home Repair
...
```

### owner_summaries.py

```
11 meld(s) completed since 2026-09-21 08:00

- #7006 Dryer not heating -> Tom Okafor (mx-summit/out/owner-drafts/meld-7006-okafor.txt)
- #7008 Closet door off track -> Elena Castellano (mx-summit/out/owner-drafts/meld-7008-castellano.txt)
- #7002 Bathroom light flickers -> Elena Castellano (mx-summit/out/owner-drafts/meld-7002-castellano.txt)
- #7014 Bathtub drain slow -> Marcus Bellamy (mx-summit/out/owner-drafts/meld-7014-bellamy.txt)
- #7003 Front door lock sticking -> Elena Castellano (mx-summit/out/owner-drafts/meld-7003-castellano.txt)
- #7001 Dishwasher won't drain -> Marcus Bellamy (mx-summit/out/owner-drafts/meld-7001-bellamy.txt)
- #7060 Thermostat screen blank -> Elena Castellano (mx-summit/out/owner-drafts/meld-7060-castellano.txt)
- #7054 No hot water -> Tom Okafor (mx-summit/out/owner-drafts/meld-7054-okafor.txt)
- #7115 Toilet running constantly -> Greg Lindqvist (mx-summit/out/owner-drafts/meld-7115-lindqvist.txt)
- #7042 Smoke detector chirping -> Priya Raman (mx-summit/out/owner-drafts/meld-7042-raman.txt)
- #7082 Bathtub drain slow -> Marcus Bellamy (mx-summit/out/owner-drafts/meld-7082-bellamy.txt)

Drafts only. Open each file, read it, then send it yourself if it looks right.
...
```

One of the drafts it wrote (`out/owner-drafts/meld-7006-okafor.txt`):

```
DRAFT — review before sending. Nothing has been sent.
To: Tom Okafor <tom.okafor@example.com>
Subject: Completed repair at Hilltop Duplex — Dryer not heating

Hi Tom,

Quick update on a repair at Hilltop Duplex (27 Hilltop Ln Unit 2, Weaverville, NC 28787).

What was reported: Dryer runs but clothes come out wet.
Reported on: September 17
Work done by: Appliance Doctors
Completed: September 21 at 01:30 PM
Cost: $232.32 (estimate was $186.75; came in over by $45.57)
The resident has not left a rating yet.

...
```

### vendor_scorecard.py

```
# Vendor Scorecard — as of September 22, 2026

| # | Vendor | Jobs | Done | Avg days to complete | Avg tenant rating | Invoice vs estimate | Cancel rate |
|---|---|---|---|---|---|---|---|
| 1 | Bright Spark Electric | 9 | 9 | 4.3 | 4.7 / 5 (7 rated) | -2% | 0% |
| 2 | Handy Hank Home Repair | 37 | 21 | 4.1 | 4.3 / 5 (16 rated) | +0% | 14% |
| 3 | Summit HVAC Services | 5 | 4 | 6.3 | 4.5 / 5 (2 rated) | +11% | 0% |
| 4 | Blue Ridge Plumbing Co. | 13 | 6 | 5.1 | 4.2 / 5 (6 rated) | +5% | 8% |
| 5 | Appliance Doctors | 12 | 8 | 5.4 | 3.6 / 5 (5 rated) | +23% | 25% |
| 6 | Ridgeline Maintenance Crew | 16 | 8 | 6.4 | 2.5 / 5 (2 rated) | +10% | 0% |
| 7 | Mountain Air Heating & Cooling | 11 | 6 | 5.7 | 3.0 / 5 (5 rated) | +31% | 18% |

Days to complete = vendor accepted the job → marked complete. Invoice vs estimate = average of (invoice − estimate) ÷ estimate; positive means over.
Ranked by a simple weighted score (rating 40%, speed 30%, on-budget 20%, not cancelled 10%). Change the weights in vendor_scorecard.py to match what you care about.

```

---

## Reading the sample results

The data is invented, but it's invented with a story so the tools have
something to say:

- **The briefing** shows a department that's behind — 30 of 42 open melds are
  overdue and one vendor is sitting on nine of them. That's the "call them
  this morning" moment.
- **The drafts** cover 11 jobs finished yesterday across five owners. Notice
  the cost line: it says over or under estimate, in dollars, so the owner never
  has to ask.
- **The scorecard** puts a small electrician at #1 (fast, loved, under estimate)
  and an HVAC company at the bottom (slow, 3.0 stars, 31% over estimate). If
  that were your data, you'd know who gets the next furnace call.
