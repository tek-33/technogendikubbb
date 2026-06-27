# TechnoDonate — PRD

## Original Problem Statement
Build TechnoDonate — a cinematic 3D donation message display web app.
- Tagline: `Message to P' Techno Gen`
- Pages: `/` public submission · `/display` protected live screen
- Theme: deep space dark, glass-morphism, neon glitch logo, volumetric glow, particle stars

## User Choices
1. Backend → FastAPI + MongoDB (replaces Firebase, polling for real-time)
2. Hosting → React app (cinematic styling adapted to React routes)
3. Display credentials → `xnytxs@gmail.com` / `h6h6h678` (hardcoded client-side)
4. Profanity filter → built-in Thai + English word list

## Architecture
- **Backend** `/app/backend/server.py` — FastAPI + Motor
  - `POST /api/messages` create
  - `GET /api/messages` list (timestamp asc)
  - `DELETE /api/messages` reset all
  - `GET /api/messages/count` → `{total, today}`
- **Frontend** React Router 7
  - `/app/frontend/src/pages/Submit.jsx`
  - `/app/frontend/src/pages/Display.jsx`
  - shared `Logo`, `StatusBadges`, `useTheme`, `usePollMessages`, `utils/{profanity,tts}`
- **Real-time** — 1500 ms polling on both pages
- **TTS** — Web Speech API, Thai (`th-TH`) auto-detected; reads only `[nickname] ส่งข้อความว่า [message]`

## What's Implemented (2026-02)
- Backend CRUD with Pydantic validation (max 30/200 chars)
- Cinematic dark theme: neon glitch logo (clip-path animation), nebula + animated stars, glass cards, 3D hover
- Submit page: live char counters, profanity filter, 10s cooldown bar, success toast, loading overlay, dark/light toggle
- Display page: hardcoded-creds login gate (session persisted), FIFO 6-second hero rotation with progress bar, archive strip (last 8), TTS toggle, fullscreen, reset confirmation, logout, empty-state orb
- Connection status, live message counter, fully responsive, `prefers-reduced-motion` respected, comprehensive `data-testid` coverage
- 100% backend pytest + frontend e2e pass (iteration_1.json)

## Personas
- **Visitor** — submits a short cinematic message to be displayed on stream
- **Operator (P' Techno)** — logs into `/display`, runs the live screen at the event with TTS + fullscreen

## Backlog
- **P1** — Strengthen Pydantic to reject whitespace-only inputs at API level (frontend already trims)
- **P1** — Persist `ttsOn` choice in `sessionStorage` (default off on first load)
- **P2** — Store timestamp as native BSON Date instead of ISO string
- **P2** — Server-Sent Events instead of polling for lower latency
- **P2** — Per-message reaction emojis on the archive strip
- **P3** — Optional Firebase deployment path for users who want the original spec
