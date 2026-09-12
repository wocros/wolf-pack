"""
Blueprint 08 — Owner Work-Order Summary (reference solution)

For every meld completed in the last 24 hours, write a plain-English email
DRAFT to the property's owner and save it as a file in
mx-summit/out/owner-drafts/. A human reads each draft and decides whether to
send it. This script does not send email, and it never should.

Run it:   python3 mx-summit/solutions/owner_summaries.py
"""

import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pm_reader as pm  # noqa: E402

COMPANY = "Blue Ridge Property Management"


def money(value):
    v = pm.to_float(value)
    return f"${v:,.2f}" if v is not None else "not yet invoiced"


def draft_for(meld, prop, owner):
    completed = pm.parse_dt(meld["marked_complete"])
    created = pm.parse_dt(meld["created"])
    rating = meld.get("tenant_rating")
    rating_line = (f"The resident rated the work {rating} out of 5." if rating
                   else "The resident has not left a rating yet.")
    est, actual = pm.to_float(meld["estimate_total"]), pm.to_float(meld["invoice_amount"])
    cost_line = f"Cost: {money(actual)}"
    if est and actual:
        diff = actual - est
        cost_line += (f" (estimate was {money(est)}; came in {'over' if diff > 0 else 'under'} by ${abs(diff):,.2f})"
                      if abs(diff) >= 1 else f" (right on the {money(est)} estimate)")

    return f"""DRAFT — review before sending. Nothing has been sent.
To: {owner['first_name']} {owner['last_name']} <{owner['email']}>
Subject: Completed repair at {prop['property_name']} — {meld['brief_description']}

Hi {owner['first_name']},

Quick update on a repair at {prop['property_name']} ({meld['unit_address']}).

What was reported: {meld['description']}
Reported on: {created:%B %d}
Work done by: {meld['vendor_name'] or 'our maintenance team'}
Completed: {completed:%B %d at %I:%M %p}
{cost_line}
{rating_line}

Nothing is needed from you. If you'd like the invoice or photos, just reply and
I'll send them over.

Best,
{COMPANY}
"""


def main():
    today = pm.as_of()
    since = today - timedelta(days=1)
    props = {str(p["id"]): p for p in pm.load_properties()}
    owners = {str(o["id"]): o for o in pm.load_owners()}

    recent = [m for m in pm.load_melds() if m["status"] == "COMPLETE"
              and pm.parse_dt(m["marked_complete"]) and pm.parse_dt(m["marked_complete"]) >= since]

    out_dir = pm.OUT_DIR / "owner-drafts"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"{len(recent)} meld(s) completed since {since:%Y-%m-%d %H:%M}\n")
    for m in sorted(recent, key=lambda m: m["marked_complete"]):
        prop = props.get(str(m["property_id"]))
        owner = owners.get(str(prop["owner_id"])) if prop else None
        if not prop or not owner:
            print(f"- #{m['id']}: skipped, no owner on file for property {m['property_id']}")
            continue
        path = out_dir / f"meld-{m['id']}-{owner['last_name'].lower()}.txt"
        path.write_text(draft_for(m, prop, owner))
        print(f"- #{m['id']} {m['brief_description']} -> {owner['first_name']} {owner['last_name']} "
              f"({path.relative_to(pm.HERE.parent)})")
    print("\nDrafts only. Open each file, read it, then send it yourself if it looks right.")


if __name__ == "__main__":
    main()
