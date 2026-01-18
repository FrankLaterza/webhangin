// Comprehensive ICE server configuration for maximum WebRTC connection reliability
// Shared across all WebRTC implementations in the app

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // ========== STUN SERVERS ==========
  // Google (Most Reliable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },

  // Cloudflare (Reliable, Fast)
  { urls: 'stun:stun.cloudflare.com:3478' },

  // Mozilla
  { urls: 'stun:stun.services.mozilla.com:3478' },

  // Stunprotocol
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun2.stunprotocol.org:3478' },

  // FreeTURN
  { urls: 'stun:freestun.net:3478' },

  // Other Reliable
  { urls: 'stun:stun.ekiga.net:3478' },
  { urls: 'stun:stun.freeswitch.org:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },

  // ========== FREE TURN SERVERS ==========
  // Open Relay Project (20GB/month free, highly recommended)
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },

  // FreeTURN (Free, Limited Bandwidth)
  {
    urls: 'turn:freestun.net:3478',
    username: 'free',
    credential: 'free'
  },

  // Turnix (10GB free/month, GeoIP routing)
  {
    urls: [
      'turn:turnix.io:80',
      'turn:turnix.io:443?transport=tcp'
    ],
    username: 'guest',
    credential: 'password'
  }
];
