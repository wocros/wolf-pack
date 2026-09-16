"""
Blueprint 07 — Daily Coordinator Briefing (reference solution)

Reads every meld, figures out what needs a human's attention this morning, and
writes a markdown briefing to mx-summit/out/briefing-YYYY-MM-DD.md.

Run it:   python3 mx-summit/solutions/daily_briefing.py
Live:     PM_MODE=api python3 mx-summit/solutions/daily_briefing.py

Read-only. It never changes anything in Property Meld.
"""

import sys
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

# Let this file find pm_reader.py one folder up, no matter where you run it from.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pm_reader as pm  # noqa: E402

PRIORITY_ORDER = {"EMERGENCY": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def age_days(meld, today):
    created = pm.parse_dt(meld["created"])
    return (today - created).days if created else 0


def line(meld, today):
    """One bullet for a meld: priority, id, what, where, how old."""
    return (f"- **{meld['priority']}** #{meld['id']} — {meld['brief_description']} "
            f"({meld['unit_address']}) — {age_days(meld, today)} days old"
            + (f" — {meld['vendor_name']}" if meld["vendor_name"] else ""))


def build_briefing(melds, today):
    open_melds = [m for m in melds if m["status"] in pm.OPEN_STATUSES]
    open_melds.sort(key=lambda m: (PRIORITY_ORDER.get(m["priority"], 9), m["created"]))

    overdue = [m for m in open_melds
               if pm.parse_dt(m["due_date"]) and pm.parse_dt(m["due_date"]) < today]
    unassigned = [m for m in open_melds if m["status"] == "PENDING_ASSIGNMENT"]
    scheduled_today = [m for m in open_melds
                       if pm.parse_dt(m["scheduled_start"])
                       and pm.parse_dt(m["scheduled_start"]).date() == today.date()]
    awaiting_signoff = [m for m in open_melds if m["status"] == "PENDING_COMPLETION"]
    completed_yesterday = [m for m in melds if m["status"] == "COMPLETE"
                           and pm.parse_dt(m["marked_complete"])
                           and pm.parse_dt(m["marked_complete"]) >= today - timedelta(days=1)]

    # Vendor callouts: anyone sitting on an assigned job past its due date.
    late_by_vendor = defaultdict(list)
    for m in overdue:
        if m["vendor_name"]:
            late_by_vendor[m["vendor_name"]].append(m)

    out = [f"# Maintenance Briefing — {today:%A, %B %d, %Y}", ""]
    out.append(f"**{len(open_melds)} open** · {len(overdue)} overdue · {len(unassigned)} unassigned · "
               f"{len(scheduled_today)} scheduled today · {len(completed_yesterday)} completed in the last 24h")
    out.append("")

    out += ["## 1. Overdue (deal with these first)", ""]
    out += [line(m, today) for m in overdue] or ["- Nothing overdue. Nice."]
    out.append("")

    out += ["## 2. Unassigned — no vendor yet", ""]
    out += [line(m, today) for m in unassigned] or ["- Everything has a vendor."]
    out.append("")

    out += ["## 3. Scheduled today", ""]
    out += [f"- {pm.parse_dt(m['scheduled_start']):%I:%M %p} — #{m['id']} {m['brief_description']} "
            f"({m['unit_address']}) — {m['vendor_name']}" for m in
            sorted(scheduled_today, key=lambda m: m["scheduled_start"])] or ["- No appointments today."]
    out.append("")

    out += ["## 4. Waiting on completion sign-off", ""]
    out += [line(m, today) for m in awaiting_signoff] or ["- None."]
    out.append("")

    out += ["## 5. Vendor callouts", ""]
    if late_by_vendor:
        for vendor, jobs in sorted(late_by_vendor.items(), key=lambda kv: -len(kv[1])):
            ids = ", ".join(f"#{j['id']}" for j in jobs)
            out.append(f"- **{vendor}** has {len(jobs)} overdue job(s): {ids}. Call them this morning.")
    else:
        out.append("- No vendor is holding an overdue job.")
    out.append("")

    out += ["## 6. Everything else that's open", ""]
    touched = {m["id"] for m in overdue + unassigned + scheduled_today + awaiting_signoff}
    out += [line(m, today) for m in open_melds if m["id"] not in touched] or ["- Nothing else."]
    out.append("")
    return "\n".join(out)


def main():
    today = pm.as_of()
    briefing = build_briefing(pm.load_melds(), today)
    pm.OUT_DIR.mkdir(exist_ok=True)
    path = pm.OUT_DIR / f"briefing-{today:%Y-%m-%d}.md"
    path.write_text(briefing)
    print(briefing)
    print(f"\n(saved to {path.relative_to(pm.HERE.parent)})")


if __name__ == "__main__":
    main()
