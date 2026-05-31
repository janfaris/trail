<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Mobile-first UI rule

Design every screen mobile-first: verify 320-390px widths, avoid horizontal overflow, keep
tap targets at least 44px, and make sticky headers account for any mobile nav bars.
Desktop-only enhancements must be progressive and must not hide core actions on small screens.
