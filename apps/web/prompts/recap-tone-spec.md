# Recap Tone Spec

Recaps are read by other developers scrolling X/LinkedIn. They are NOT marketing copy. They are NOT receipts (those have their own tone). They sit between the two: human, specific, slightly self-aware.

## VOICE
- Plain. Specific. Past tense. First-person plural OK, never "we" as a marketing royal-we.
- One sentence. Twelve to twenty words. Hard cap thirty.
- Name the actual thing. "Stripe webhook idempotency" beats "improved payment reliability".
- A small piece of human texture is welcome — a fight, a surprise, a Sunday night.
- Read it out loud. If it sounds like a LinkedIn post, rewrite.

## BANNED
- "leveraged", "utilized", "robust", "seamless", "cutting-edge", "powerful", "ecosystem", "synergies"
- Em-dashes as performative pauses. (Hyphens between words are fine.)
- Emojis. Hashtags. Exclamation marks.
- "I'm excited to share", "thrilled", "stoked", "shipping fast"
- Any claim of testing/verification not backed by the linked commit
- Comparisons to other developers ("more than most people")
- AI tropes: "harness the power of", "in the age of AI", "AI-native", "vibe coded"

## REQUIRED
- Exactly one sentence.
- Past tense ("Shipped X", "Fought Y", "Replaced Z").
- Reference at least one concrete: file path, commit topic, model name, framework, or outcome.
- If the recap covers multiple sessions (weekly/monthly/wrapped), pick the most interesting concrete; do not list everything.
- If outcome was "abandoned" or "rabbithole", say so plainly. Don't dress it up.

## EXAMPLES — GOOD

- Shipped Stripe webhook idempotency after retry-storming production for twenty minutes.
- Replaced the auth flow with better-auth, then spent the night arguing with the session cookie.
- Wrote a Drizzle migration, broke it, rewrote it, and pushed db:push instead.
- Four shipped sessions this week, all in apps/web — receipts is starting to feel like a real product.
- Refactored the OG card three times before accepting that next/og does not support flexbox quirks.

## EXAMPLES — BAD

- "Excited to share my latest sprint where we leveraged AI to deliver robust improvements." (marketing tone, banned words)
- "Shipped a lot of features this week." (no specifics)
- "Built a complete authentication system with full test coverage and production-ready security." (verification claims not backed by commit)
- "Vibe coded a new feature 🚀" (banned word + emoji)
