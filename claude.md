# CLAUDE.md - WebHangin Project Documentation

## Overview

WebHangin is a **multiplayer 3D web game** where users create customizable avatars, join themed rooms based on their activity, and hang out together with real-time movement, chat, screen sharing, and **voice chat with spatial audio**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  /                          │  /room                                        │
│  - Character Creator        │  - 3D Scene (Three.js)                        │
│  - Shape/Color/Activity     │  - WASD Movement + Spacebar Jump              │
│  - Cookie Persistence       │  - Player Avatars (local + remote)            │
│  - Welcome Back Flow        │  - Chat Panel                                 │
│                             │  - Screen Share                               │
│                             │  - Voice Chat (Microphone)                    │
│                             │  - Spatial Audio (Distance-based Volume)      │
│                             │  - Talking Indicators (Animated Sprites)      │
└──────────────────┬──────────┴───────────────────────────────────────────────┘
                   │ WebSocket (ws://localhost:3001/stream?name=...&shape=...&color=...&activity=...)
┌──────────────────▼──────────────────────────────────────────────────────────┐
│                              BACKEND (Rust/Actix)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  main.rs                    │  streaming/handler.rs                         │
│  - HTTP/WS Server           │  - WebSocket Actor (StreamingSession)         │
│  - Activity→Room Routing    │  - Player lifecycle (join/leave)              │
│  - PlayerJoinQuery          │  - Message handlers                           │
│  - Static File Serving      │  - WebRTC signaling                           │
│  - Frontend (from /out)     │  - Audio track publishing (with playerId)     │
├─────────────────────────────┼───────────────────────────────────────────────┤
│  streaming/room.rs          │  External: rheomesh SFU                       │
│  - Room<T> struct           │  - WebRTC publish/subscribe                   │
│  - RoomOwner<T> manager     │  - ICE candidate exchange                     │
│  - Player tracking (HashMap)│  - SDP offer/answer                           │
└─────────────────────────────┴───────────────────────────────────────────────┘
```

---

## Message Protocol

### Client → Server (`ReceivedMessage`)

| Message | Fields | Description |
|---------|--------|-------------|
| `Ping` | - | Keep-alive |
| `PublisherInit` | - | Initialize WebRTC publish transport |
| `SubscriberInit` | - | Initialize WebRTC subscribe transport |
| `Offer` | `sdp` | WebRTC SDP offer |
| `Answer` | `sdp` | WebRTC SDP answer |
| `PublisherIce` | `candidate` | ICE candidate for publishing |
| `SubscriberIce` | `candidate` | ICE candidate for subscribing |
| `Subscribe` | `publisherId` | Subscribe to a stream |
| `Publish` | `publisherId` | Announce published track |
| `StopPublish` | `publisherId` | Stop publishing |
| `StopSubscribe` | `subscriberId` | Stop subscribing |
| `ChatMessage` | `message` | Send chat message |
| `PlayerMove` | `position`, `rotation` | Update player position |
| `PlayAnimation` | `animation` | Trigger animation ("jump", "wave", "dance") |

### Server → Client (`SendingMessage`)

| Message | Fields | Description |
|---------|--------|-------------|
| `Pong` | - | Keep-alive response |
| `Answer` | `sdp` | WebRTC SDP answer |
| `Offer` | `sdp` | WebRTC SDP offer |
| `PublisherIce` | `candidate` | ICE candidate |
| `SubscriberIce` | `candidate` | ICE candidate |
| `Published` | `publisherIds`, `playerId` | New streams available (with owner ID) |
| `Subscribed` | `subscriberId` | Subscription confirmed |
| `Unpublished` | `publisherId` | Stream removed |
| `ChatMessage` | `sender`, `message` | Broadcast chat |
| `RoomState` | `yourPlayerId`, `players`, `roomTheme` | Initial room state |
| `PlayerJoined` | `player` | New player joined |
| `PlayerLeft` | `playerId` | Player left |
| `PlayerMoved` | `playerId`, `position`, `rotation` | Player moved |
| `PlayerAnimation` | `playerId`, `animation` | Player animation triggered |

---

## Data Structures

### Backend (Rust)

```rust
struct Position { x: f32, y: f32, z: f32 }

struct PlayerData {
    id: String,          // UUID (assigned by server)
    name: String,        // Display name
    shape: String,       // "circle" or "square"
    color: String,       // Hex color "#ff9500"
    activity: String,    // Free-text activity
    position: Position,  // World position
    rotation: f32,       // Y-axis rotation (radians)
}
```

### Frontend (TypeScript)

```typescript
type AnimationType = 'jump' | 'wave' | 'dance' | null;

interface PlayerData {
    id: string;
    name: string;
    shape: string;
    color: string;
    activity: string;
    position: { x: number; y: number; z: number };
    rotation: number;
}
```

---

## Activity-Based Room Routing

Keywords in activity → Themed Room:

| Keywords | Room ID | Display Name |
|----------|---------|--------------|
| music, guitar, piano | `music-lounge` | Music Lounge |
| art, draw, paint | `art-studio` | Art Studio |
| code, program, study | `focus-den` | Focus Den |
| game, gaming | `gaming-corner` | Gaming Corner |
| (default) | `hangout-hub` | Hangout Hub |

---

## Frontend Components

### Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Character creator splash screen |
| `/room` | `app/room/page.tsx` | 3D game room |

### Key Components (`room/page.tsx`)

```typescript
// Shared animation hook
usePlayerAnimation() → { triggerAnimation, updateAnimation, currentAnimation }

// Remote player avatar
PlayerAvatar({ player, animation })

// Local player with controls  
LocalPlayer({ player, onMove, onAnimation })

// Room floor plane
RoomFloor()
```

### Animation System

- `AnimationType` enum: `'jump' | 'wave' | 'dance' | null`
- Shared `usePlayerAnimation()` hook for both local and remote
- Jump uses parabolic arc: `sin(progress * PI) * 1.5`
- One-shot animation: progress resets to 0 at completion

### Billboard Name Tags

- Uses `<Billboard>` from `@react-three/drei`
- Always faces camera regardless of player rotation
- Prevents unreadable rotated text

---

## Voice Chat & Spatial Audio

### Microphone System

**Activation:**
- "Start Mic" button in sidebar
- Captures audio via `getUserMedia({ audio: true })`
- Publishes audio tracks via WebRTC
- Mute/unmute without disconnecting

**Talking Detection:**
- Real-time audio level analysis using Web Audio API
- `AnalyserNode` with frequency data
- Threshold-based detection (configurable, default: 10)
- 800ms delay after stopping to prevent flickering

**Talking Indicators:**
- Animated sprite sheet (2-frame loop at 0.4s intervals)
- Shows in sidebar UI when talking
- Displays above player avatars in 3D world
- Only visible when audio exceeds threshold and mic is unmuted

### Spatial Audio (`SpatialAudio.tsx`)

**Current Implementation (Distance-based Volume):**
- Manual distance calculation between camera and player
- Linear volume falloff: `volume = 1 - (distance / soundRadius)`
- Default sound radius: 20 units
- Updates every frame (60fps)

**Volume Formula:**
```typescript
distance = camera.position.distanceTo(playerPosition)
if (distance <= soundRadius) {
    volume = 1 - (distance / soundRadius)
} else {
    volume = 0
}
```

**Debug Logging (every 5 seconds):**
- Distance in units
- Calculated volume percentage
- Direction (LEFT/RIGHT/FRONT/BEHIND)
- Angle from camera
- Player and camera positions
- Audio element state (playing/paused/muted)

**Known Limitations:**
- No stereo panning (left/right ear positioning)
- HTML audio `volume` property may not affect MediaStreams
- Consider switching to Web Audio API's PannerNode for true spatial audio

**Audio Stream Mapping:**
- Backend sends `playerId` with `Published` message
- Frontend maps `publisherId` → `playerId`
- Enables per-player audio tracking and volume control

---

## Single-Port Deployment

### Architecture

Backend (Rust/Actix) serves **both** API and static frontend:
- **Port 3001**: HTTP, WebSocket, and static files
- Frontend built to `frontend/out/` via `npm run build`
- Backend serves from `../frontend/out` using `actix-files`

### Benefits

- **ngrok compatibility**: Only one port to expose
- **Simplified deployment**: Single process serves everything
- **Dynamic WebSocket URLs**: Frontend detects `window.location.host`

### WebSocket Connection

```typescript
// Automatically uses current host (works with ngrok)
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.host;
const wsUrl = `${protocol}//${host}/stream?${params}`;
```

---

## Running the Project

### Quick Start (Recommended)

```bash
# Root directory - builds frontend and starts backend
./run.sh       # macOS/Linux
run.bat        # Windows
```

### Manual Steps

```bash
# 1. Build frontend (static export to /out)
cd frontend
npm run build

# 2. Start backend (serves both API and frontend)
cd backend
cargo run
# → http://0.0.0.0:3001
```

### With ngrok (for external access)

```bash
# Terminal 1: Start backend (after building frontend)
cd backend
cargo run

# Terminal 2: Expose with ngrok
ngrok http 3001
# Share the ngrok URL - works for both frontend and WebSocket!
```

---

## Build Scripts

| File | Platform | Purpose |
|------|----------|---------|
| `run.sh` | macOS/Linux | Build frontend + start backend |
| `run.bat` | Windows | Build frontend + start backend |

Both scripts:
1. Navigate to `frontend/` and run `npm run build`
2. Check for build errors
3. Navigate to `backend/` and run `cargo run`

---

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `src/main.rs` | Server, routes, activity→room routing |
| `src/streaming/handler.rs` | WebSocket actor, messages, PlayerData |
| `src/streaming/room.rs` | Room/RoomOwner, player tracking |
| `src/streaming/mod.rs` | Module exports |

### Frontend
| File | Purpose |
|------|---------|
| `app/page.tsx` | Character creator, cookie persistence |
| `app/room/page.tsx` | 3D scene, controls, chat, streaming, mic controls |
| `app/room/SpatialAudio.tsx` | Distance-based volume control for voice chat |
| `next.config.ts` | Static export configuration (`output: 'export'`) |
| `public/assets/textures/` | Sprite sheets (talking indicator, etc.) |

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Player identity confusion | Assumed last player in list was "us" | Added `yourPlayerId` to `RoomState` |
| Double jump animation | Progress decreased after reaching 1 | One-shot: reset to 0 instead of decrease |
| Name tags rotating | Text rotated with player group | Wrapped in `<Billboard>` component |
| Audio sources not removing | Publisher IDs not tracked/unpublished | Added `audioPublisherIdsRef` and `StopPublish` messages |
| Spatial audio not working | HTML audio `volume` may not work with MediaStreams | Consider Web Audio API's GainNode/PannerNode |
| Port already in use | Backend still running from previous session | `lsof -ti:3001 \| xargs kill -9` |
| Sprite sheet 404 error | Assets in `/assets/` instead of `/public/` | Copy to `/public/assets/` for Next.js static serving |
| ngrok WebSocket fails | Hardcoded `localhost` URL | Use dynamic `window.location.host` |

---

## Future Enhancements

### Audio Improvements
- [ ] True spatial audio with Web Audio API PannerNode
- [ ] Stereo panning (left/right positioning based on player location)
- [ ] Audio gain control with GainNode (for reliable volume control)
- [ ] Voice activity detection improvements
- [ ] Push-to-talk option

### Visual Features
- [ ] Chat bubbles above avatars in 3D
- [ ] More animations (wave, dance)
- [ ] Screen share "hologram" in front of player
- [ ] Player activity labels visible in 3D
- [ ] Audio visualization (sound waves around talking players)

### Backend
- [ ] Persistent user accounts
- [ ] Backend-driven animations
- [ ] Room capacity limits
- [ ] Admin controls

### Other
- [ ] Speech-to-text / text-to-speech
- [ ] Mobile support
- [ ] VR support

---

## Completed Features

- [x] Voice chat with microphone capture
- [x] Talking detection with audio analysis
- [x] Animated talking indicators (sprite sheet)
- [x] Distance-based volume control
- [x] Single-port deployment (ngrok compatible)
- [x] Dynamic WebSocket URLs
- [x] Audio stream cleanup on disconnect
- [x] Per-player audio tracking

---

**Last Updated**: January 17, 2026
