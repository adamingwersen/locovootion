# Locovotion

AI-powered voice walking tours. Drop a pin or draw a route on the map and get spoken narration about the landmarks around you — like having a knowledgeable local friend in your earphones.

Currently covers **Copenhagen**, with landmark data sourced from Wikipedia.

## How it works

**Pin mode** — Tap anywhere on the map to drop a pin. Locovotion finds the nearest landmark via Wikipedia's GeoSearch API, sends it to Claude for narration, and speaks the result aloud through ElevenLabs.

**Route mode** — Tap multiple waypoints to trace a walking route. Locovotion discovers landmarks along the path, and Claude curates the best ones into an ordered tour with spoken transitions paced for a slow stroll (~50 m/min). A transport bar lets you play, pause, and skip between stops.

## Tech stack

- **Next.js 15** (App Router) with React 19
- **Leaflet** via react-leaflet for the map (CARTO dark basemap)
- **Claude** (Anthropic API) for narration generation and tour curation
- **ElevenLabs** for natural text-to-speech
- **Wikipedia GeoSearch** for landmark discovery (no API key needed)

## Getting started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- An [ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys)

### Setup

```bash
git clone <your-repo-url>
cd locovotion
npm install
cp .env.example .env
```

Fill in your keys in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM   # optional, defaults to "Rachel"
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Geolocation ("find my location") requires HTTPS in browsers. It works on localhost during development, but you'll need a deployed HTTPS URL for real-device testing.

## Deploy to Vercel

1. Push this repo to GitHub
2. Import it at [vercel.com/new](https://vercel.com/new) — Next.js is auto-detected, no build config needed
3. Add these environment variables in the Vercel dashboard:

   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | Your Anthropic key |
   | `ELEVENLABS_API_KEY` | Your ElevenLabs key |
   | `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` (optional) |

4. Deploy — Vercel provides HTTPS by default, so geolocation works out of the box

## Project structure

```
app/
  page.tsx             # Main UI — mode switching, narration, tour playback
  layout.tsx           # Root layout and metadata
  globals.css          # All styles
  api/
    narrate/route.ts   # Claude generates spoken narration for a single landmark
    route-tour/route.ts # Claude curates and narrates a multi-stop walking tour
    tts/route.ts       # ElevenLabs text-to-speech proxy
components/
  MapView.tsx          # Leaflet map with pins, routes, and sight markers
lib/
  geo.ts               # Haversine distance, path sampling, route geometry
  wikipedia.ts         # Wikipedia GeoSearch and extract fetching
```

## License

MIT
