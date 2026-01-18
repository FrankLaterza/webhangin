use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceServer {
    pub urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

pub fn get_ice_servers() -> Vec<IceServer> {
    vec![
        // STUN Servers (No auth required)
        IceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:stun1.l.google.com:19302".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:stun2.l.google.com:19302".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:stun3.l.google.com:19302".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:stun4.l.google.com:19302".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:stun.cloudflare.com:3478".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:stun.services.mozilla.com:3478".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:stun.stunprotocol.org:3478".to_string()],
            username: None,
            credential: None,
        },
        IceServer {
            urls: vec!["stun:freestun.net:3478".to_string()],
            username: None,
            credential: None,
        },

        // TURN Servers (Authentication required)
        IceServer {
            urls: vec![
                "turn:openrelay.metered.ca:80".to_string(),
                "turn:openrelay.metered.ca:443".to_string(),
                "turn:openrelay.metered.ca:443?transport=tcp".to_string(),
            ],
            username: Some("openrelayproject".to_string()),
            credential: Some("openrelayproject".to_string()),
        },
        IceServer {
            urls: vec!["turn:freestun.net:3478".to_string()],
            username: Some("free".to_string()),
            credential: Some("free".to_string()),
        },
        IceServer {
            urls: vec![
                "turn:turnix.io:80".to_string(),
                "turn:turnix.io:443?transport=tcp".to_string(),
            ],
            username: Some("guest".to_string()),
            credential: Some("password".to_string()),
        },
    ]
}
