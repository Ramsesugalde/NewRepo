# My Kindroid Companion

A personal chat page for a Kindroid AI companion. Static frontend (`index.html`) + one Netlify serverless function (`netlify/functions/kindroid-chat.mts`) that proxies to the Kindroid inference API so your API key never reaches the browser.

The proxy logic is adapted from [KindroidAI/Kindroid-discord](https://github.com/KindroidAI/Kindroid-discord)'s `src/kindroidAPI.ts` — same request/response contract (`share_code` / `conversation` / `enable_filter`, `Authorization: Bearer` + `X-Kindroid-Requester` headers), just called from a browser session instead of a Discord bot.

## Personalize it
Edit the `CONFIG` object near the top of the `<script>` in `index.html`:
- `companionName` — your persona's name
- `avatarInitial` — a letter or emoji for the avatar
- `greeting` — the first message shown when the page loads

## Set up (required before the chat will actually work)
This repo ships with **no real credentials** — `.env.example` documents what's needed, but the chat function returns a clear "not configured yet" error until you set these as environment variables in Netlify (Site configuration → Environment variables), not in this repo:

- `KINDROID_API_KEY` — Bearer token from your Kindroid account/API settings
- `KINDROID_INFER_URL` — the Kindroid inference endpoint URL
- `KINDROID_SHARE_CODE` — the share code identifying which persona to talk to

## Deploy
Any Netlify site pointed at this repo picks up `netlify.toml` automatically (static publish from `.`, function from `netlify/functions/`). No build step needed beyond Netlify installing the one dependency in `package.json`.

## A note on abuse protection
The function has a basic best-effort in-memory rate limit (20 messages / 10 min per browser session) to blunt casual abuse of your Kindroid quota, but it resets on cold start and isn't a real guard. If this page gets real traffic, consider also turning on Netlify's site password (visitor access controls) so only people you share it with can use it.
