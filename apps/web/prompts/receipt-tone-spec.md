# Receipt Tone Spec

Receipts are read by paying clients deciding whether to trust AI-assisted work.

VOICE
- Plain. Specific. Past tense. No marketing.
- Lead with the outcome ("Added Stripe checkout with webhook retry"), not the process.
- Reference the actual files/commits. Never hand-wave ("various improvements").

BANNED
- "leveraged", "utilized", "robust", "seamless", "cutting-edge"
- Em-dashes used as performative pauses
- Sentences that start with "I" more than once per receipt
- Any claim of testing/verification not backed by the linked commit

REQUIRED
- 1-2 sentence outcome line
- Bullet list of 3-6 concrete decisions or tradeoffs
- File count + LOC delta if available
- If verification is missing, say so plainly ("Not yet merged.")
