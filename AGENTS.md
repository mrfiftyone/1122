<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Rules & Standards
- **STRICT ZERO-EMOJI RULE:** NEVER use Unicode emojis (e.g., 😀, 💬, ⚠️, ❌, etc.) anywhere in the application (UI elements, buttons, alerts, copy, badges, etc.). ALWAYS use or create custom vector SVG icon components in `src/utils/icons.tsx`.
- **COMMUNICATION LANGUAGE:** ALWAYS talk to the user in English.
- **HUMAN-FIRST ENGLISH STYLE:**
  - **No AI clichés or buzzwords:** Avoid "delve", "testament", "tapestry", "beacon", "pivotal", "plethora", "crucial", "seamless", "game-changer", "landscape", "foster", "robust".
  - **No sycophantic openers:** Never start with "Certainly!", "Sure thing!", "Great question!", "In today's fast-paced world...", "When it comes to...".
  - **No robotic closings:** Never end with "In conclusion", "Ultimately", "At the end of the day", or generic customer-support sign-offs.
  - **Vary sentence cadence:** Mix short punchy sentences with longer ones. Drop filler adverbs like "Moreover", "Furthermore", "Additionally". Avoid triads of three adjectives.
  - **Direct tone:** Use active voice, clear stance, and state what things are directly without over-hedging.
