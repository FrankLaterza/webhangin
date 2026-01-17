# CLAUDE.md - WebHangin Project Documentation

## Overview

WebHangin is a **multiplayer 3D web game** where users create customizable avatars, join themed rooms based on their activity, and hang out together with real-time movement, chat, and screen sharing.

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
└──────────────────┬──────────┴───────────────────────────────────────────────┘
                   │ WebSocket (ws://localhost:3001/stream?name=...&shape=...&color=...&activity=...)
┌──────────────────▼──────────────────────────────────────────────────────────┐
│                              BACKEND (Rust/Actix)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  main.rs                    │  streaming/handler.rs                         │
│  - HTTP/WS Server           │  - WebSocket Actor (StreamingSession)         │
│  - Activity→Room Routing    │  - Player lifecycle (join/leave)              │
│  - PlayerJoinQuery          │  - Message handlers                           │
│                             │  - WebRTC signaling                           │
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
| `Published` | `publisherIds` | New streams available |
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

## Running the Project

```bash
# Backend
cd backend
cargo run
# → http://0.0.0.0:3001

# Frontend
cd frontend
npm run dev
# → http://localhost:3000
```

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
| `app/room/page.tsx` | 3D scene, controls, chat, streaming |

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Player identity confusion | Assumed last player in list was "us" | Added `yourPlayerId` to `RoomState` |
| Double jump animation | Progress decreased after reaching 1 | One-shot: reset to 0 instead of decrease |
| Name tags rotating | Text rotated with player group | Wrapped in `<Billboard>` component |
| Cargo not found | Windows path issue | Use `alias cargo="/c/Users/willc/.cargo/bin/cargo.exe"` |

---

## Future Enhancements

- [ ] Chat bubbles above avatars in 3D
- [ ] More animations (wave, dance)
- [ ] Screen share "hologram" in front of player
- [ ] Player activity labels visible in 3D
- [ ] Persistent user accounts
- [ ] Backend-driven animations
- [ ] Speech-to-text / text-to-speech

---

**Last Updated**: January 17, 2026
