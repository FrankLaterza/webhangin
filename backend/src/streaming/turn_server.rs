use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use webrtc::ice_transport::ice_server::RTCIceServer;

#[derive(Deserialize, Debug)]
struct XirsysResponse {
    v: Option<XirsysValue>,
    s: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct XirsysValue {
    ice_servers: Option<XirsysIceServers>,
}

#[derive(Deserialize, Debug)]
struct XirsysIceServers {
    urls: Vec<String>,
    username: Option<String>,
    credential: Option<String>,
}

/// Fetches TURN/STUN servers from Xirsys API
pub async fn fetch_xirsys_ice_servers() -> Vec<RTCIceServer> {
    // Check for both XIRSYS_* and NEXT_PUBLIC_XIRSYS_* (frontend's .env format)
    let username = std::env::var("XIRSYS_USERNAME")
        .or_else(|_| std::env::var("NEXT_PUBLIC_XIRSYS_USERNAME"))
        .unwrap_or_default();
    let secret = std::env::var("XIRSYS_SECRET")
        .or_else(|_| std::env::var("NEXT_PUBLIC_XIRSYS_SECRET"))
        .unwrap_or_default();
    let channel = std::env::var("XIRSYS_CHANNEL")
        .or_else(|_| std::env::var("NEXT_PUBLIC_XIRSYS_CHANNEL"))
        .unwrap_or_else(|_| "webhangin".to_string());

    if username.is_empty() || secret.is_empty() {
        tracing::warn!("Xirsys credentials not found, using default STUN servers only");
        tracing::warn!("Set XIRSYS_USERNAME and XIRSYS_SECRET environment variables for TURN support");
        return default_ice_servers();
    }

    let credentials = STANDARD.encode(format!("{}:{}", username, secret));
    let url = format!("https://global.xirsys.net/_turn/{}", channel);

    tracing::info!("Fetching TURN servers from Xirsys for channel: {}", channel);

    let client = reqwest::Client::new();
    let response = client
        .put(&url)
        .header("Authorization", format!("Basic {}", credentials))
        .header("Content-Type", "application/json")
        .body(r#"{"format":"urls"}"#)
        .send()
        .await;

    match response {
        Ok(resp) => {
            if !resp.status().is_success() {
                tracing::error!("Xirsys API error: {}", resp.status());
                return default_ice_servers();
            }

            match resp.json::<XirsysResponse>().await {
                Ok(data) => {
                    if let Some(v) = data.v {
                        if let Some(ice_servers) = v.ice_servers {
                            let mut servers = Vec::new();

                            // Separate STUN and TURN servers
                            let stun_urls: Vec<String> = ice_servers
                                .urls
                                .iter()
                                .filter(|url| url.starts_with("stun:"))
                                .cloned()
                                .collect();

                            let turn_urls: Vec<String> = ice_servers
                                .urls
                                .iter()
                                .filter(|url| url.starts_with("turn:") || url.starts_with("turns:"))
                                .cloned()
                                .collect();

                            // Add STUN servers (no credentials needed)
                            if !stun_urls.is_empty() {
                                servers.push(RTCIceServer {
                                    urls: stun_urls.clone(),
                                    ..Default::default()
                                });
                                tracing::info!("Added {} STUN servers from Xirsys", stun_urls.len());
                            }

                            // Add TURN servers with credentials
                            if !turn_urls.is_empty() {
                                servers.push(RTCIceServer {
                                    urls: turn_urls.clone(),
                                    username: ice_servers.username.clone().unwrap_or_default(),
                                    credential: ice_servers.credential.clone().unwrap_or_default(),
                                    ..Default::default()
                                });
                                tracing::info!("Added {} TURN servers from Xirsys", turn_urls.len());
                            }

                            if !servers.is_empty() {
                                tracing::info!("✅ Successfully configured {} ICE server groups from Xirsys", servers.len());
                                return servers;
                            }
                        }
                    }
                    tracing::warn!("Xirsys response missing ice_servers, using defaults");
                    default_ice_servers()
                }
                Err(e) => {
                    tracing::error!("Failed to parse Xirsys response: {}", e);
                    default_ice_servers()
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to fetch from Xirsys: {}", e);
            default_ice_servers()
        }
    }
}

/// Returns default STUN servers as fallback
fn default_ice_servers() -> Vec<RTCIceServer> {
    vec![RTCIceServer {
        urls: vec![
            "stun:stun.l.google.com:19302".to_string(),
            "stun:stun1.l.google.com:19302".to_string(),
            "stun:stun.cloudflare.com:3478".to_string(),
        ],
        ..Default::default()
    }]
}
