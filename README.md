# cupid music player

Shared YouTube Music remote — a pixel-art web app where the admin plays music on their device and other users control the queue in real time.

- `/admin`: signs in with Google, picks a YouTube playlist, the admin's device plays via YouTube IFrame Player.
- `/user`: sees the live queue + currently playing, can skip / prev / reorder / remove / add tracks. No audio plays on their side — they're just driving the admin's player.
- Pixel-art frame, record-player + needle animations, marquee, pink/blue themes preserved from the original Electron build.

## Stack

- Next.js 14 (App Router) + TypeScript
- NextAuth with Google provider (`youtube.readonly` scope)
- Upstash Redis for room state
- Pusher Channels for realtime sync
- YouTube IFrame Player API on the admin's browser

## Prerequisites

1. **Google Cloud project** with YouTube Data API v3 enabled. Create an OAuth 2.0 client (Web application). Add the redirect URI `http://localhost:3000/api/auth/callback/google` (and your Vercel domain once deployed).
2. **Pusher Channels app** — copy app id, key, secret, cluster.
3. **Upstash Redis database** — create at https://console.upstash.com, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## Setup

```bash
npm install
cp .env.example .env.local
# fill in NEXTAUTH_SECRET (openssl rand -base64 32), GOOGLE_*, PUSHER_*, UPSTASH_*, ADMIN_EMAILS
npm run dev
```

Then open `http://localhost:3000/`.

## Roles

- `/admin` is gated by `ADMIN_EMAILS` (comma-separated whitelist). Anyone else signing in is redirected to `/user`.
- `/user` is open to everyone (anonymous viewers can watch the queue; adding tracks requires Google sign-in because we hit the YouTube search API).

## Deploy to Vercel

1. Push to a GitHub repo.
2. Import into Vercel.
3. Add the same env vars from `.env.local` to the Vercel project (use a fresh `NEXTAUTH_SECRET`).
4. Register the deployed origin's callback URL in Google Cloud (`https://<your-domain>/api/auth/callback/google`).
5. Visit `https://<your-domain>/admin` on your phone.

## Mobile notes

- iOS Safari and Android Chrome require a user gesture before audio plays — the admin sees a "tap to start" overlay once a queue is loaded.
- The admin's page requests Wake Lock so the screen stays on while playing.
- The PlayerFrame is sized in `vw` units; portrait mobile is the primary target. Landscape and desktop will work but may clip vertically.

## v1 limits

- Single room (`room:default`). Architecture supports multi-room but no UI to pick one.
- YT Music playlists may not all appear in `playlists?mine=true` — fallback "paste URL" support is on the roadmap.
- Spotify, Apple Music, and local files from the original Electron build are intentionally dropped in v1.
