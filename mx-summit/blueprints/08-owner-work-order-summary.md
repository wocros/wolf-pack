# Blueprint 08 — Owner Work-Order Summary

**The problem:** A repair gets done. The owner finds out three weeks later, on
their statement, as a line item that says "PLUMBING $312.50." They call. You dig
through Property Meld to reconstruct what happened. Multiply by every job, every
owner, every month.

**What this builds:** For every meld completed in the last 24 hours, a short,
plain-English email draft to that property's owner: what the tenant reported,
what was done, who did it, what it cost versus the estimate, and how the tenant
rated it. Each draft is saved as a file. **A human reads it and sends it.**

**Time to build:** About 20 minutes

**What to have ready:** Nothing — the sample data includes owners mapped to
properties.

---

## Before you start: drafts only

This tool writes files. It does not send email, and you should not add sending
to it. The moment an automated message goes to an owner, you've made a promise
about accuracy you can't take back — a wrong dollar amount or the wrong
property in an auto-sent email costs you the relationship. So: draft, human
reads, human sends. Every time. That rule is in `AGENTS.md` and Claude will
follow it.

---

## Hand This to Jarvis

*Open Claude Code in the `wolf-pack` folder. Copy everything below the line.
Paste it. Hit enter.*

---

Read mx-summit/AGENTS.md first and follow its rules.

I want to build a tool that drafts owner update emails for completed maintenance
work, from Property Meld data.

Here's the problem: owners find out about repairs when they see the charge on
their statement, and then they call me with questions. I'd rather they hear from
me the day the work is done, but writing each email by hand takes too long.

Here's exactly what I want it to do:

1. Read melds, properties, and owners using mx-summit/pm_reader.py
   (use its as_of() as "today")
2. Find every meld with status COMPLETE whose marked_complete is in the last
   24 hours
3. For each one, look up the property, then the property's owner
4. Write one email draft per meld as a text file in mx-summit/out/owner-drafts/,
   named by meld number and owner. Each draft should have:
   - A first line that says DRAFT — review before sending
   - To: the owner's name and email
   - Subject: the property name and what was fixed
   - A short, friendly body in plain English: what the tenant reported, when,
     who did the work, when it was completed, the cost (and whether it was
     over or under the estimate), and the tenant's rating if there is one
   - A closing line saying nothing is needed from them
   - Sign it from Blue Ridge Property Management
5. Print a list of the drafts it wrote so I can see what's ready to review
6. If a meld has no owner on file, skip it and tell me

Do NOT send anything. No email, no SMS, no API calls except reading. Drafts
only — I will read and send them myself.

Keep it to one Python file in mx-summit/, standard library only. Handle blanks
gracefully (some melds have no rating or no invoice yet).

Please tell me what you're going to build before you write anything. I want to
approve the plan first.

---

## After the Build

Each morning:
```
python3 mx-summit/owner_summaries.py
```
Open `mx-summit/out/owner-drafts/`. Read each one. If it's right, paste it into
your email and send. If it's wrong, fix the draft — and tell Claude what was
wrong so the next one is better.

Things people ask for next: "group all of one owner's jobs into a single
email," "add a line about the warranty," "skip anything under $50."

**Result:** Owners hear about work the day it's done, in your voice, in two
minutes of your time instead of twenty. The phone stops ringing about statements.

---

## Session 2 note

In Session 2 this reads your live account. The governance rule doesn't change:
**a human approves anything owner-facing.** The scheduled job writes drafts to a
folder; you (or your coordinator) review and send. Never wire this to an email
API. See [`../session2/README.md`](../session2/README.md) for why, and for the
Fair Housing and TCPA notes that apply the moment a message reaches a person.
