# Session 2 — Build the Agents That Make It Run

### Same tool. Live data. On a schedule. With rails.

---

In Session 1 you built a tool that reads a CSV. In this session you make three
changes, and none of them touch the code you wrote:

1. Point it at your **live** Property Meld account
2. Run it **on a schedule** so it happens without you
3. Add **governance rails** so it can't hurt anyone

Do them in that order. Each one works on its own.

---

## 1. Switch to Live Data

`pm_reader.py` has two modes. You've been using `csv`. The other one is `api`.

**Get credentials.** Property Meld issues API access per account — ask your
account manager for a client ID, client secret, and your tenant ID. (If you
don't have them today, that's fine; everything below still works against the
sample data.)

**Put them in a `.env` file.** From the `wolf-pack` folder:
```
cp mx-summit/.env.example mx-summit/.env
```
Open `mx-summit/.env` and fill in:
```
PM_MODE=api
PM_CLIENT_ID=your-client-id
PM_CLIENT_SECRET=your-client-secret
PM_TENANT_ID=your-tenant-id
```
`.env` is gitignored. It never gets committed. Never paste those values into
Claude Code or a blueprint prompt either — the reader picks them up from the
file.

**Run the same command as before:**
```
python3 mx-summit/pm_reader.py
```
It should say `mode: api` and print your real counts. Then run your tool from
Session 1. Same file, same output format, your actual melds.

**Two honest caveats about api mode:**

- `pm_reader` reads melds, vendors, properties, and owners. Estimates,
  invoices, and resident names live on *other* Property Meld endpoints and come
  through blank. The blueprints handle blanks. Adding `/estimates/` and
  `/invoices/` to `pm_reader.py` is a good "ask Claude" task once the basics
  work — it's the same pattern as the four functions already there.
- The token URL in `.env.example` is our best understanding of Property Meld's
  OAuth setup. If your API docs show a different one, set `PM_TOKEN_URL` in
  `.env` — no code change needed.

---

## 2. Run It on a Schedule

**Why polling, not webhooks.** Some systems will call *you* the moment a work
order changes. Property Meld does not push work-order webhooks. So the pattern
is the boring, reliable one: your tool wakes up on a timer, reads what's
changed, and writes its output. For a morning briefing, once a day at 7:30am is
exactly right. For anything else, hourly is plenty.

### Option A — cron on your Garage server

If you set up a server from [`../../setup/`](../../setup/), you already have a
place for this to run. SSH in, clone the repo there, set up `.env` the same way,
and add one line to cron:

```
crontab -e
```
```
30 7 * * 1-5  cd /root/wolf-pack && python3 mx-summit/my_briefing.py >> mx-summit/out/run.log 2>&1
```
Use whatever filename Claude gave your tool in Session 1 — `my_briefing.py`
here is just an example.

That's "7:30am, Monday through Friday, run the briefing, and append everything
it says to a log file." The `>> run.log` part is your audit trail (see rails,
below).

To get the briefing somewhere people look: sync `mx-summit/out/` to a shared
folder, or ask Claude to add a *Slack incoming webhook* step that posts the
briefing to your **internal** maintenance channel. Internal-only is the key
word — that's a safe first automation because no tenant or owner ever sees it.

### Option B — GitHub Actions

If you'd rather not run a server, GitHub will run it for you on a timer.
[`example-schedule.yml`](example-schedule.yml) is a complete, working workflow:

- Runs the briefing at 7:30am Eastern on weekdays
- Reads credentials from GitHub's encrypted Secrets, never from a file in the repo
- Saves `mx-summit/out/` as a downloadable artifact
- **Posts nowhere.** It does not email, Slack, or call anything. You download
  the artifact and read it.

To use it: copy it to `.github/workflows/mx-briefing.yml` in your fork, add the
three `PM_*` secrets under *Settings → Secrets and variables → Actions*, and
push. You can trigger it by hand from the Actions tab to test.

---

## 3. Governance Rails

These are not optional, and they are not complicated. Every tool in this track
already follows them. Keep it that way when you extend one.

**Read-only against Property Meld.** `pm_reader.py` only ever does GET (plus
the one POST that trades your secret for a login token). Don't add writes. If
you ever want a tool to *change* something in Property Meld — close a meld,
assign a vendor — that's a different conversation with different rules, and it
starts with a human clicking a button, not a script deciding.

**Drafts, not sends.** Anything a person will read gets written to a file. A
human opens it, reads it, and sends it — or doesn't. This is why Blueprint 08
writes `DRAFT` at the top of every email. The internal briefing (Blueprint 07)
is the one exception you can automate the *delivery* of, because its audience
is your own team.

**A human approves anything owner- or tenant-facing.** Not "reviews a sample."
Approves each one. If that feels slow, the fix is a faster review step, not
removing it.

**Log every run.** What ran, when, how many records it read, what it wrote.
The cron line above does this with `>> run.log`; the GitHub workflow keeps its
own logs. When something looks wrong in three weeks, the log is how you find
out whether the tool did something odd or the data did.

**Fair Housing and TCPA — read this paragraph even if you skip the rest.**
The moment a tool decides *who* gets a message, *what order* requests get
handled in, or *what* a message says, it's making decisions that housing law
cares about. Never let a tool prioritize or phrase anything based on a tenant's
name, language, family situation, disability, or anything else that hints at a
protected class — prioritize on the *request* (an emergency is an emergency),
never the *person*. And a text message to a tenant is regulated (TCPA): it needs
their prior consent, and "the script sent it" is not a defense. Drafts-and-a-
human sidesteps most of this. The day you're tempted to automate a send to a
tenant, stop and talk to your attorney first. The full version of these rules
lives in [`../../GOVERNANCE.md`](../../GOVERNANCE.md).

---

## What "Done" Looks Like

- `python3 mx-summit/pm_reader.py` prints `mode: api` and your real counts
- Your Session 1 tool runs unchanged against live data
- It runs on a schedule, and you can see the log from the last run
- Nothing it produces reaches an owner or tenant without a person sending it

That's a maintenance department with an agent in it. Tomorrow morning the
briefing will be there before you are.
