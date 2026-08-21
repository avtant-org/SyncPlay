# SyncPlay

SyncPlay is a synchronized local-video watch-together platform powered by Cloudflare Workers and Durable Objects. 

**Wait! Doesn't a watch-together site need a lot of bandwidth?**
No! SyncPlay uses a unique architecture where the heavy lifting (the video file) is handled entirely client-side. The Cloudflare Worker only acts as the "Sync Plane," passing small real-time messages to coordinate playback.

## Features
- **Local File Playback**: Select a video file from your computer (`movie.mp4`) and play it directly in your browser.
- **Zero Uploads**: Your video file is *never* uploaded to any server. Total privacy and zero bandwidth costs.
- **Host Authority**: Only the host can seek, play, pause, or change playback speed. Viewers follow the host's actions automatically.
- **Drift Correction**: Viewers automatically slightly adjust their playback speeds (e.g. 0.95x or 1.05x) to stay perfectly in sync without jarring skips.
- **Cloudflare Native**: Entirely built on Cloudflare Workers and Durable Objects. Fast, distributed, and scalable.

## Architecture

The application is split cleanly into two boundaries:

1. **Control/Sync Plane** (Cloudflare Workers & Durable Objects)
   - Handles WebSocket connections.
   - Manages room state (Participants, Host).
   - Provides server-time synchronization.
   - Acts as the authoritative source of playback state.

2. **Media Plane** (Browser HTML5 Video)
   - Reads the local file via `URL.createObjectURL()`.
   - Handles decoding, rendering, and local volume.
   - Adjusts playback based on Sync Plane commands.

```
                CLOUDFLARE
        ┌─────────────────────────┐
        │       Worker            │
        │                         │
        │   Routing / WebSocket   │
        │          │              │
        │          ▼              │
        │   Durable Object        │
        │                         │
        │  Room State             │
        │  Host Authority         │
        │  Participants           │
        │  Sync State             │
        │  Server Timing          │
        └────────────┬────────────┘
                     │
              Sync Messages
                     │
        ┌────────────┴────────────┐
        │                         │
     Browser A                Browser B
        │                         │
   Local Video                Local Video
        │                         │
   <video>                     <video>
        │                         │
    Local File                 Local File
```

### Future Remote-Media Architecture
The codebase strictly separates the Sync logic (`sync.js`) from the media delivery (`mediaSource.js`). In the future, this makes it possible to introduce a `RemoteMediaSource` (e.g. Cloudflare Stream or R2 delivery) without changing the synchronization algorithm.

## Local Development

You need Node.js and Wrangler installed.

```bash
npm install
npm run dev
```

1. Open `http://localhost:8787` in your browser.
2. Enter your name and create a room.
3. Open a new incognito window (or another browser) and join the room.
4. Select the *exact same* local video file in both browsers.
5. In the Host window, press Play. Both windows will stay in sync!

## Deployment

Deploying to Cloudflare is as simple as:

```bash
npm run deploy
```

*(Note: Cloudflare Durable Objects are now available on the free plan using SQLite-backed storage, which is configured in `wrangler.toml`).*

## Security Model

- **Room Boundaries**: State is strictly confined to the Durable Object for that specific room ID.
- **Host Permissions**: The backend specifically rejects any `PLAY`, `PAUSE`, `SEEK`, or `RATE` commands originating from non-hosts.
- **Client Side Secrets**: No Cloudflare API keys are shipped to the client. The Worker handles all secure bindings.
