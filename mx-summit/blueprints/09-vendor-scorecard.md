# Blueprint 09 — Vendor Scorecard

**The problem:** You *feel* like one HVAC company is slow and always over
estimate, but when it's time to decide who gets the next job, all you've got is
a feeling. Meanwhile your best handyman gets no more work than your worst,
because nobody's counting.

**What this builds:** A ranked scorecard of every vendor, from the melds they've
actually worked: how many jobs, average days from accepting the job to marking
it complete, average tenant rating, how far invoices land from estimates, and
how often their jobs get cancelled. One table. The gut feeling becomes a number
you can show the vendor.

**Time to build:** About 20 minutes

**What to have ready:** Nothing — the sample data has 7 vendors and 90 days of
completed work.

---

## Hand This to Jarvis

*Open Claude Code in the `wolf-pack` folder. Copy everything below the line.
Paste it. Hit enter.*

---

Read mx-summit/AGENTS.md first and follow its rules.

I want to build a vendor scorecard from my Property Meld data.

Here's the problem: I assign work based on habit and gut feeling. I don't
actually know which vendors are fast, which ones tenants like, and which ones
routinely bill more than they quoted.

Here's exactly what I want it to do:

1. Read every meld using mx-summit/pm_reader.py
2. Group them by vendor (skip melds with no vendor)
3. For each vendor, calculate:
   - Total jobs assigned and how many are COMPLETE
   - Average days to complete (from assigned_at to marked_complete, completed jobs only)
   - Average tenant rating, and how many jobs were rated
   - Cost variance: average of (invoice_amount − estimate_total) ÷ estimate_total,
     as a percentage, only where both numbers exist
   - Cancellation rate: MANAGER_CANCELED jobs ÷ total jobs
4. Rank the vendors. Use a simple weighted score — tenant rating matters most,
   then speed, then staying on estimate, then cancellations — and tell me the
   weights so I can change them
5. Write the result as a markdown table to mx-summit/out/vendor-scorecard.md,
   with a two-line note under it explaining how each column is calculated
6. Print the table to the screen too

Keep it to one Python file in mx-summit/, standard library only. Handle blanks
(not every completed job has a rating or an invoice). No sending anything.

Please tell me what you're going to build before you write anything. I want to
approve the plan first.

---

## After the Build

Run it monthly, or before a vendor review:
```
python3 mx-summit/vendor_scorecard.py
```
Bring the table to the conversation. "You've been 31% over estimate on average
for 90 days" is a very different meeting than "it feels like you're expensive."

Things people ask for next: "break it out by category so I can see who's best
at plumbing," "only count the last 30 days," "flag anyone under 3.5 stars."

**Result:** Work goes to the vendors who earn it. The ones who don't get a
number, not a vibe, and a fair chance to fix it.

---

## Session 2 note

On live data the picture is bigger — a year of melds, real invoices from the
`/invoices/` endpoint instead of the inlined sample column. This one doesn't
need to run on a schedule; monthly by hand is fine. But it's a good candidate
for "run it and save the table with today's date" so you can see trends. See
[`../session2/README.md`](../session2/README.md).
