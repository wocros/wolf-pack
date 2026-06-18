# Wolf Pack — Instructor Guide
### Your complete playbook for running the class

---

## The Big Picture

You are running a 2.5-day class for non-technical property managers.
Most have never used a terminal. Some are nervous. All of them paid $1,400+
and have high expectations because they've seen what you've built.

Your job is not to teach them to code.
Your job is to get every single person in that room to a working server
with a working agent before they leave — and to make them feel capable,
not overwhelmed.

**The emotional arc you're managing:**
- Day 1 Morning: Excitement → possible anxiety during setup
- Day 1 Afternoon: Relief when it works → first real session with Claude
- Day 2: Flow state — they're building, it's clicking
- Day 3: Pride — they built something. Then hunger — they want more.

Watch for people falling behind in Day 1. That's where you lose them.
A student who can't get their server running by lunch on Day 1 will mentally
check out for the rest of the class.

---

## What You Need Before Class

### 1 Week Out
- [ ] Send the pre-class email (`class/pre-class-email.md`)
      Fill in the actual date, time, location, and the web form URL
      (wocros.github.io/wolf-pack)
- [ ] Confirm venue has screen mirroring or HDMI for your laptop
- [ ] Have a plan to mirror your phone to the screen for the Sophia demo
      (AirPlay, QuickTime + USB cable, or Reflector app)
- [ ] Know which students are Crane members and which aren't

### 2 Days Out
- [ ] Test Sophia — send her a few messages, make sure she's responsive
- [ ] Test the full setup script yourself on a fresh server
      (`curl -fsSL https://raw.githubusercontent.com/wocros/wolf-pack/main/setup/vps-setup.sh | bash`)
- [ ] Pull the latest repo: `cd /root/wolf-pack && git pull origin main`
- [ ] Prepare your Day 1 live demo prompt for Sophia (see `demo/sophia-demo.md`)
- [ ] Print or share the workbook (`class/workbook.md`) — Google Doc link or printed

### Night Before
- [ ] Test your phone → screen mirror setup in the actual venue if possible
- [ ] Have a backup tenant text ready in case no student volunteers one
- [ ] Charge your phone fully
- [ ] Know the WiFi password for the venue — you'll say it out loud 10+ times
- [ ] Have Hostinger open in a browser tab so you can demo the server creation live

---

## Ideal Room Setup

- Everyone on laptops (not tablets — they need a real keyboard)
- WiFi that can handle 10 simultaneous SSH connections — test this before class day,
  hotel/venue "business WiFi" often blocks port 22 (the SSH port). If it does,
  students can use Hostinger's built-in browser console as a fallback.
- Your screen visible to everyone
- You able to walk the room — you will be walking constantly on Day 1

**Do you need a helper?**
Yes — you have 10 students, which is one too many to manage solo on Day 1.
One stuck student at the SSH step can pull you away from the room for 10 minutes
while 9 others sit idle or get confused.

Bring one helper. Their job is simple: walk the room during setup steps while
you lead from the front. A Crane member who's technical, or anyone who has
already gone through this setup, works perfectly. Brief them the night before
on the 4–5 common errors in the setup section below.

---

## Day 1 — Foundation

### Morning: The Demo + Setup (9:00am – 12:30pm)

**9:00 — Open with Sophia. No slides. No agenda. No introduction.**
Walk in and say "Before we do anything else, I want to show you something."
Full script: `demo/sophia-demo.md`
This runs 15–20 minutes including the debrief.

**9:20 — Then and only then: introduce the class.**
- Who's in the room (quick round: name, city, how many units)
- The 2.5-day arc (Sophia is the destination, today is the foundation)
- The one rule: say when you're confused, out loud, immediately

**9:35 — Accounts check.**
Ask who completed the pre-class homework:
- Hands up: Hostinger account ✓
- Hands up: GitHub account ✓
- Hands up: Anthropic API key ✓
- Hands up: Claude Code Desktop installed ✓

For anyone missing accounts: pair them with someone who has theirs while they catch up.
Do NOT let the whole room wait for one person to create an account.

**9:45 — Create the server together.**
Walk through Hostinger live on your screen. Students follow on theirs.
Go slow. Narrate every click.
Key moment: when the IP address appears. Ask everyone to write it down.
Wait until every person has an IP address before moving on.

**10:15 — SSH into the server.**
Open Claude Code Desktop. Show the terminal panel.
Type `ssh root@YOUR_IP` on your screen. Students do the same.
This is the first moment of real anxiety — the terminal.
Say: *"Nothing will appear when you type your password. That's normal. Type it anyway and press Enter."*
Wait for everyone to be connected before moving on.

**10:35 — Run the setup script.**
Copy the curl command from the repo. Paste it. Run it.
Walk around the room while it runs — this takes 3–5 minutes per person.
While it's running: answer questions, check on anyone who got an error.

Common errors at this step:
- `curl: command not found` → run `apt-get install curl -y` first
- Script stops at API key step → they need to get their key now (Anthropic tab)
- `Permission denied` → they're not logged in as root, run `sudo -i` first

**11:00 — API key + test.**
The script tests the key automatically.
Anyone who gets ✓ "API key works!" — they're good.
Anyone who gets an error — check their key, check their Anthropic billing credit.

**11:15 — Fork and clone the repo.**
Walk through GitHub live. Fork → copy URL → clone onto server.
`cd /root && git clone [URL] wolf-pack && cd wolf-pack`
Wait for everyone before moving on.

**11:30 — Fill in CLAUDE.md via the web form.**
Direct everyone to: **wocros.github.io/wolf-pack**
They fill it out on their phone or laptop, copy the output, paste it into their server.
Give them 15 minutes. Walk the room and help.
This is the most important 15 minutes of Day 1 — the quality of their CLAUDE.md
determines the quality of everything they build.

**11:50 — First Claude session.**
`cd /root/wolf-pack && claude`
Everyone types: *"Who am I and what is this server for?"*
When Claude answers with their name and business — that's the first personal moment.
Let them sit with it for 30 seconds. Don't rush past it.

**12:00 — Lunch break.**
Before breaking: *"Every single one of you now has the same infrastructure Sophia runs on.
That's not a metaphor. Same stack. Same foundation. This afternoon we go deeper."*

---

### Afternoon: Understanding Agents (1:30pm – 5:00pm)

**1:30 — What is an agent? (30 min)**
Use the workbook Part 2. Cover:
- Chatbot vs. agent (the table in the workbook)
- How CLAUDE.md is read every session
- How agents chain steps without being asked for each one

Don't lecture for more than 15 minutes at a stretch. Demonstrate instead.

**2:00 — Walk through the maintenance agent prompt.**
Open `demo/maintenance-agent-prompt.md` in Claude.
Use a real tenant text from someone in the room.
Let them watch it run. Ask: *"What did it just do that you didn't ask it to do?"*
That question surfaces the agent concept better than any explanation.

**2:30 — Everyone runs the maintenance agent themselves.**
They use a real text from their own business.
First hands-on agent session. Walk the room.
Common reaction: "Can I change this?" → Yes. Show them how.

**3:30 — Introduce Day 2: the lease renewal agent.**
Ask: *"Who here has a lease expiring in the next 90 days?"*
(Almost every hand goes up.)
*"Tomorrow you build the thing that handles that automatically."*

**4:00 — Free build / exploration time.**
No instruction. Let them play.
Your job: walk the room, answer questions, watch for the person who looks lost.
The students who thrive here will surprise you. Let them go.

**5:00 — Day 1 close.**
*"What did you build today that you didn't have this morning?"*
Go around the room. Every person says one thing.
This anchors the day and builds confidence for Day 2.

---

## Day 2 — Build

### The Arc: Everyone leaves with a working lease renewal agent

**9:00 — Problem statements (30 min)**
Each student states their specific problem out loud.
Not "I want to automate my business." Specific:
*"I have 12 leases expiring in Q3 and I manually write renewal letters for each one."*
Write each problem on a whiteboard or shared doc.
These are their Day 2 build targets.

**9:30 — Teach the build process (20 min)**
Show the ask-before-build workflow live:
1. Describe the problem to Claude in plain English
2. Ask for a plan before any code
3. Review the plan, approve or redirect
4. Build one step at a time
5. Test with real data before calling it done

Demonstrate this on your screen with a real example.

**10:00 – 12:00 — Lease renewal agent build session**
Students work. You walk.
Prompt to get them started:
```
Based on my CLAUDE.md, I want to build a lease renewal agent.
It should: identify my leases expiring in the next 90 days,
draft a personalized renewal letter for each tenant,
and create a follow-up schedule. Give me a plan in plain English
before writing anything.
```

Watch for students who:
- Skip the plan step and go straight to code → redirect them
- Get a plan they don't understand → have them ask Claude to simplify it
- Finish early → point them to connecting it to their actual tech stack

**12:00 — Lunch**
Before breaking: quick show of hands — who has something running?
Celebrate it. Even partial counts.

**1:30 – 4:00 — Build continues + tech stack connections**
Second half of Day 2 is about connecting to real tools.
Help students identify which tool in their CLAUDE.md can connect to what they built.
Google Sheets is usually the easiest first connection.

Common Day 2 wins:
- Lease renewal letters generated from a pasted list
- Late rent notice drafted in 30 seconds
- Owner report populated from copy-pasted numbers
- Maintenance log updated automatically

**4:00 – 5:00 — Show and tell**
Every student demos what they built for 2 minutes.
No judgment. No comparison. Just show it running.
This is the second biggest emotional moment of the class.
The room energy will be high. Let it run long if needed.

---

## Day 3 — Roadmap + Community (Half Day)

**9:00 — The path from here to Sophia (45 min)**
This is your most important teaching moment.
Show the architecture: what you built (one agent) → what Sophia is (many agents, memory, runtime).
The gap is not talent. The gap is time and iteration.
Be honest: Sophia took months. But every single step is learnable.

Draw it on a whiteboard:
```
What they have now:          What Sophia is:
- Server ✓                   - Server ✓
- CLAUDE.md ✓                - Rich memory system ✓
- One agent ✓                - 20+ agents ✓
- Manual trigger             - Runtime (runs 24/7)
                             - Phone/Slack interface
                             - Cross-agent communication
```

*"The only difference between that left column and the right column is what you
decide to build next, and how many weeks you spend building it."*

**9:45 — Next 30 days: the post-class guide**
Walk through `class/post-class-guide.md` together.
Week 1, Week 2, Week 3, Month 1 targets.
Make it concrete: *"What are you building in Week 2? Write it down right now."*

**10:15 — The community (Crane)**
This is the natural moment — not a pitch, a transition.

*"Everything you built this week — you built it alone. Imagine doing this
with 200 other property managers who are building the same kinds of things.
That's Crane. And you've been in a room with some of them for 2.5 days."*

For non-Crane members: present the offer clearly.
For Crane members: tell them about the #wolf-pack channel and what's there.

**11:00 — Certificates / Graduation moment**
However you want to handle this — photos, certificates, something tangible.
People need to mark the finish line.

**11:30 — Open Q&A + informal wrap**
No agenda. Just questions.
Stay as long as people have questions. This is the high-value time.

---

## Managing the Room

### When someone gets stuck
Don't fix it for them. Ask: *"What did you tell Claude, and what did it do?"*
Then: *"What do you think went wrong?"*
Then: *"Tell Claude exactly that — what you think went wrong — and ask it to explain before fixing."*

Teaching them to debug is more valuable than fixing the bug.

### When someone is way ahead
Give them a stretch goal:
- Connect their agent to a real Google Sheet
- Add a second agent that does something different
- Try to chain two agents together

### When someone is falling behind
Pair them with someone who's ahead. Peer teaching is faster than instructor teaching
and both students benefit.

### When the energy dips (usually 3pm Day 1 and 11am Day 2)
Stop what you're doing. Ask someone to show what they have — even if it's small.
Visible progress resets the room better than any pep talk.

### When something breaks for everyone
Breathe. This happens. Say: *"This is the job. Debugging is 70% of building.
Let's figure this out together."* Model the process — read the error out loud,
ask Claude what it means, fix one thing at a time.

---

## Things to Say Often

- *"You are not learning to code. You are learning to direct an AI that can code."*
- *"Simple is better than clever. If you have to explain how it works, it's too complicated."*
- *"Test it with real data before calling it done."*
- *"If Claude goes sideways, start a new session and read your CLAUDE.md back to it."*
- *"The goal isn't perfect. The goal is running."*

---

## After Class — Your Checklist

- [ ] Send a follow-up email within 24 hours (link to post-class guide, community invite)
- [ ] Add non-Crane members to the Crane invite flow
- [ ] Create the #wolf-pack channel in Crane if not already there
- [ ] Note anything that broke or confused students — update the setup guide
- [ ] Pull any new prompts or agents students built that should go into the repo
- [ ] Schedule the first monthly office hours session
