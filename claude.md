# WebHangin - Project Context

## Overview

WebHangin is a web-based real-time video streaming platform that allows users to share their screens and hang out together in virtual rooms. It uses WebRTC for peer-to-peer media streaming with an SFU (Selective Forwarding Unit) architecture powered by Rheomesh.

## Architecture

### High-Level Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│  Next.js        │◄────────────────────────────►│  Actix-web       │
│  Frontend       │      (Signaling)             │  Backend         │
│                 │                              │                  │
│  - React UI     │                              │  - Room Manager  │
│  - Rheomesh     │         WebRTC Media         │  - Rheomesh SFU  │
│    Client       │◄────────────────────────────►│  - Actor System  │
└─────────────────┘                              └──────────────────┘
```

### Key Components

1. **Frontend (Next.js + React + TypeScript)**
   - Streaming UI with room management
   - Rheomesh client library for WebRTC
   - Handles local media capture and remote stream playback

2. **Backend (Rust + Actix-web + Rheomesh)**
   - WebSocket server for signaling
   - SFU media routing using Rheomesh
   - Actor-based concurrency model
   - Room-based broadcasting

3. **Rheomesh SFU**
   - Selective Forwarding Unit for media routing
   - Handles WebRTC transport (publish/subscribe)
   - ICE candidate exchange
   - SDP offer/answer negotiation

## Tech Stack

### Backend
- **Rust** - Systems programming language
- **Actix-web 4.9** - Web framework with actor model
- **Actix 0.13** - Actor framework
- **Rheomesh 0.6.3** - WebRTC SFU library (git submodule: `backend/lib/rheomesh/sfu`)
- **WebRTC 0.14** - WebRTC implementation
- **Tokio** - Async runtime
- **Tracing** - Logging and observability

### Frontend
- **Next.js 16** - React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Rheomesh 0.6.3** - WebRTC client (npm package)
- **Tailwind CSS 4** - Styling
- **Three.js + React Three Fiber** - 3D graphics (home page)

## Directory Structure

```
webhangin/
├── backend/
│   ├── Cargo.toml
│   ├── lib/
│   │   └── rheomesh/            # Git submodule
│   │       └── sfu/             # Rheomesh SFU library
│   ├── src/
│   │   ├── main.rs              # Actix-web server entry point
│   │   └── streaming/
│   │       ├── mod.rs
│   │       ├── handler.rs       # WebSocket actor for streaming
│   │       └── room.rs          # Room management system
│   └── target/
│
├── frontend/
│   ├── package.json
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Home page with 3D donut
│   │   ├── globals.css
│   │   └── stream/
│   │       └── page.tsx         # Streaming interface
│   └── next.config.ts
│
└── claude.md                     # This file
```

## Important Implementation Details

### Why Actix-web Instead of Axum?

**Critical Decision**: The backend uses Actix-web (not Axum) because:
- Rheomesh types are **NOT `Send`-safe**
- Designed for single-threaded actor model (Actix)
- Actix's actor system allows non-`Send` types
- Attempting to use Axum/Tokio resulted in compilation errors

### Room Management System

**File**: `backend/src/streaming/room.rs`

- Generic over actor type `T: Actor`
- `Room<T>` manages users (actor addresses) in a virtual room
- `RoomOwner<T>` manages multiple rooms and handles creation/deletion
- Rooms are automatically cleaned up when the last user leaves

### WebSocket Actor

**File**: `backend/src/streaming/handler.rs`

The `StreamingSession` actor handles:
- WebRTC signaling (ICE, SDP)
- Publish/Subscribe transports
- Broadcasting to room peers
- Lifecycle management (started/stopped)

Key traits implemented:
- `Actor` - Actix actor lifecycle
- `StreamHandler<Result<ws::Message, ws::ProtocolError>>` - WebSocket messages
- `Handler<ReceivedMessage>` - Client messages
- `Handler<SendingMessage>` - Messages to client

## WebSocket Protocol

### Connection

```
ws://localhost:3001/stream?room=<room_id>
```

### Message Format (JSON)

All messages have an `action` field that determines the message type.

#### Client → Server Messages

```typescript
// Initialize publisher transport
{ action: "PublisherInit" }

// Initialize subscriber transport
{ action: "SubscriberInit" }

// Send ICE candidate
{ action: "PublisherIce", candidate: RTCIceCandidateInit }
{ action: "SubscriberIce", candidate: RTCIceCandidateInit }

// Send SDP offer
{ action: "Offer", sdp: RTCSessionDescription }

// Send SDP answer
{ action: "Answer", sdp: RTCSessionDescription }

// Publish a track
{ action: "Publish", publisherId: string }

// Subscribe to a publisher
{ action: "Subscribe", publisherId: string }

// Stop publishing/subscribing
{ action: "StopPublish", publisherId: string }
{ action: "StopSubscribe", subscriberId: string }

// Heartbeat
{ action: "Ping" }
```

#### Server → Client Messages

```typescript
// SDP offer/answer
{ action: "Offer", sdp: RTCSessionDescription }
{ action: "Answer", sdp: RTCSessionDescription }

// ICE candidates
{ action: "PublisherIce", candidate: RTCIceCandidateInit }
{ action: "SubscriberIce", candidate: RTCIceCandidateInit }

// Notify of available publishers
{ action: "Published", publisherIds: string[] }

// Confirm subscription
{ action: "Subscribed", subscriberId: string }

// Heartbeat response
{ action: "Pong" }
```

## WebRTC Flow

### Publishing Flow (Sending Media)

```
1. Client: getDisplayMedia() → Get screen capture
2. Client: Send "PublisherInit"
3. Server: Set up ICE candidate callback
4. Client/Server: Exchange ICE candidates
5. Client: publishTransport.publish(track)
6. Client: Send "Offer" with SDP
7. Server: Generate SDP answer
8. Server: Send "Answer"
9. Client: setAnswer()
10. Client: Send "Publish" with publisherId
11. Server: Notify peers in room
```

### Subscribing Flow (Receiving Media)

```
1. Client: Send "SubscriberInit"
2. Server: Set up ICE + negotiation callbacks
3. Server: Send "Published" with available publisherIds
4. Client: Send "Subscribe" for each publisherId
5. Server: Create subscriber, generate SDP offer
6. Server: Send "Offer"
7. Client: setOffer() → Generate SDP answer
8. Client: Send "Answer"
9. Server: Set answer
10. Client: subscribeTransport.subscribe(publisherId)
11. Client: Receive MediaStreamTrack
```

## Codec Configuration

### Audio Codecs
- **Opus** (48kHz, 2 channels)
  - Payload type: 111
  - Features: `minptime=10;useinbandfec=1`

### Video Codecs
- **H.264** (90kHz)
  - Payload type: 102
  - Profile: `42001f` (Baseline, Level 3.1)
  - Packetization mode: 1
  - RTCP feedback: goog-remb, ccm fir, nack, nack pli

## Setup and Running

### Prerequisites
```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js 18+
# (Install via nvm, homebrew, or nodejs.org)
```

### Running the Backend

```bash
cd backend
cargo run
# Server starts on http://0.0.0.0:3001
# WebSocket available at ws://0.0.0.0:3001/stream?room=<room_id>
```

### Running the Frontend

```bash
cd frontend
npm install  # First time only
npm run dev
# Opens on http://localhost:3000
```

### Testing the Stream

1. Open two browser tabs
2. Navigate to `http://localhost:3000/stream` in both
3. Both should connect to the same room (default: "lobby")
4. Tab 1: Click "Start Streaming" → Select screen/window
5. Tab 2: Should receive and display the stream

## Key Files Reference

### Backend

| File | Purpose |
|------|---------|
| `src/main.rs` | Actix-web server, routes, codec config |
| `src/streaming/handler.rs` | WebSocket actor, signaling logic |
| `src/streaming/room.rs` | Room management, user tracking |
| `Cargo.toml` | Rust dependencies |

### Frontend

| File | Purpose |
|------|---------|
| `app/page.tsx` | Home page with 3D donut animation |
| `app/stream/page.tsx` | Streaming interface |
| `app/layout.tsx` | Root layout, metadata |
| `package.json` | Node dependencies |

## Common Issues and Solutions

### Port Already in Use
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9
```

### WebSocket Connection Failed
- Ensure backend is running
- Check correct port (3001)
- Verify room ID is provided in query string
- Check browser console for errors

### No Media Stream
- Browser must support `getDisplayMedia()`
- User must grant screen sharing permission
- Check ICE candidate exchange in network tab
- Verify STUN server is reachable (`stun.l.google.com:19302`)

### Compilation Errors
- Ensure Rheomesh submodule is initialized: `git submodule update --init --recursive`
- Path should be: `path = "lib/rheomesh/sfu"` in backend/Cargo.toml
- Verify WebRTC version matches (0.14)
- Check Rust toolchain is up to date

## Performance Considerations

### Backend
- 14 Actix workers (auto-scaled to CPU cores)
- Each WebSocket connection is an independent actor
- Room cleanup happens automatically when empty
- Transports are closed properly on disconnect

### Frontend
- Screen capture at native resolution
- No transcoding (direct forwarding)
- Automatic reconnection on ICE failure
- Efficient React rendering with hooks

## Security Notes

⚠️ **Current Configuration - Development Only**:
- CORS allows any origin
- No authentication/authorization
- No rate limiting
- No encryption (use wss:// and https:// in production)

For production:
- Add user authentication
- Implement room passwords/access control
- Use HTTPS/WSS with valid certificates
- Add rate limiting
- Configure proper CORS origins
- Add TURN server for NAT traversal

## Future Enhancements

Potential features to add:
- [ ] User authentication system
- [ ] Room passwords
- [ ] Multiple simultaneous streams per user
- [ ] Audio streaming
- [ ] Chat functionality
- [ ] Recording capability
- [ ] Adaptive bitrate (SVC/Simulcast)
- [ ] Mobile support
- [ ] Screen annotations
- [ ] Virtual backgrounds

## References

- [Rheomesh Documentation](https://github.com/h3poteto/rheomesh)
- [Actix-web Documentation](https://actix.rs/)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Next.js Documentation](https://nextjs.org/docs)

## License

[Add your license here]

## Contributors

[Add contributors here]

---

**Last Updated**: January 2026
**Claude Code Session**: Implemented complete WebRTC streaming platform with Rheomesh SFU
