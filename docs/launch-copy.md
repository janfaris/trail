# Trail Launch Copy — Draft

_Saved for later use. Lane A: The AI Coding Portfolio._

---

## X / Twitter — Main Launch Tweet

> Recruiters see your commits.
> They don't see how you think.
>
> Trail is the AI coding portfolio. Drop one link in your bio:
> trail.dev/u/jankarlo
>
> Free. Built it because GitHub couldn't show what mattered.

**Media**: 15-30s screen recording. Open jankfaris.com → scroll to embedded `<trail-profile>` widget → click into a featured session → show redacted-secrets badge + AI reasoning chain → zoom out to "drop trail.dev/u/you in your bio".

**Timing**: Tue–Thu, 9am–1pm PT.
**Tag**: 1–3 warm supporters who'll retweet (no hashtag cluster).

---

## X Thread (reply chain)

**1/** Why portfolios are broken in the AI era.

A GitHub graph in 2026 tells you nothing. Half the commits were co-written with Claude or Cursor. The interesting part — the prompts, the dead ends, the recovery — lives in chat logs nobody sees.

**2/** What Trail captures.

Every AI coding session: prompts, tool calls, errors, fixes, the actual reasoning trail. Auto-anonymized. Shareable as a public profile or a single embed.

[screenshot: a real session page]

**3/** How anonymization works.

24+ secret detectors + entropy guard + LLM red-team pass before anything goes public. Every redaction is visible on the page so recruiters know it's clean, not edited for show.

[screenshot: redaction badge]

**4/** The embed.

`<script src="trail.dev/u/you.js"></script>` on your personal site. Shows your top 3 sessions with thumbnails. Real engineers using it:

[3 real personal sites side-by-side]

**5/** Make yours in 60 seconds: trail.dev

Free. No credit card. Would love brutal feedback.

---

## Show HN Post

**Title**: `Show HN: Trail – an AI coding portfolio you embed on your personal site`

**Body**:

Hi HN — I built Trail because my GitHub stopped telling the truth about how I work. Most of my real engineering happens in Claude Code and Cursor: the prompts I tried, the dead ends, the way I broke down a gnarly bug. None of that survives a `git log`.

Trail captures AI coding sessions (Claude Code, Codex, Hermes, generic CLI), anonymizes secrets with a 24+ detector pipeline plus an LLM red-team pass, and publishes them as a profile at `trail.dev/u/<you>`. The piece I'm most interested in feedback on is the embeddable widget — a script tag you drop on your personal site that shows your 3 featured sessions, so a recruiter loading your portfolio actually sees how you think.

Stack: Next.js 15, Neon Postgres, Drizzle, better-auth, pgvector. AI via Azure Foundry (gpt-5.4-mini + text-embedding-3-small).

Three things I'd love HN to break:
1. Anonymization — try to leak a secret through a public session.
2. The embed widget — does it actually fit on a real personal site, or does it look like a third-party badge?
3. The profile framing — does "AI coding portfolio" land, or does it sound like a gimmick?

Live: https://gettrail.vercel.app
Sample profile: https://gettrail.vercel.app/u/jankarlo

— Jan

---

## LinkedIn Long-Form

**Hook**:

I looked at my GitHub last week and realized it had stopped telling the truth.

**Body**:

Most of the engineering I'm proud of in 2026 didn't happen in commits. It happened in a chat window. The 40-message debugging session where I figured out a Postgres deadlock. The refactor I argued through with Claude. The dead ends. The recovery.

None of that shows up on a GitHub profile. Recruiters see green squares. They don't see how I think.

So I built Trail.

It's an AI coding portfolio. You capture your sessions (Claude Code, Cursor, Codex, Hermes), Trail anonymizes the secrets, and you publish a profile at `trail.dev/u/<you>` — or, the part I care about most, you embed a widget on your personal site so anyone visiting sees your three best sessions inline.

My own profile is the landing page. No marketing slop. If it works for me, it works.

Three things I want to be honest about:
- It's free during launch. Paid tier comes later, and I'll telegraph it months in advance.
- The anonymizer is good but not perfect. Public sessions get a visible redaction badge so you (and the recruiter) can see what was removed.
- This is Lane A of three possible directions. I'm betting everything on the portfolio angle for the next 90 days. If you're a hiring manager at a dev-tool company, I want to talk to you in month 2 — not now.

Try it: https://gettrail.vercel.app

If you build with AI tools and have a personal site, I'd love five minutes of your honest reaction.

---

## Internal Checklist Before Posting

- [ ] Demo video recorded, captioned, ≤30s
- [ ] `trail.dev/u/jankarlo` polished: ≥3 featured sessions pinned, bio, skill tags
- [ ] Embed widget live on jankfaris.com
- [ ] 5 warm contacts notified 24h ahead so they're ready to RT
- [ ] Show HN drafted in HN's actual editor (preview formatting)
- [ ] LinkedIn scheduled for 7am PT same day as X launch
- [ ] Analytics: confirm referrer tracking works for embed loads
