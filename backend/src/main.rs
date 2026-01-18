mod streaming;

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web::web::{Data, Query};
use actix_web_actors::ws;
use actix_cors::Cors;
use actix_files as fs;
use rheomesh::config::{CodecConfig, MediaConfig};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing_actix_web::TracingLogger;
use tracing_subscriber::prelude::*;
use webrtc::api::media_engine;
use webrtc::rtp_transceiver::rtp_codec::{RTCRtpCodecCapability, RTCRtpCodecParameters};
use webrtc::rtp_transceiver::RTCPFeedback;

use streaming::{RoomOwner, StreamingSession, PlayerData, FacialFeatures, fetch_xirsys_ice_servers};

/// Query parameters for joining a room
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerJoinQuery {
    name: String,
    color: String,
    activity: String,
    eye_style: String,
    nose_style: String,
    mouth_style: String,
    #[serde(default = "default_character_type")]
    character_type: String,
}

fn default_character_type() -> String {
    "cat".to_string()
}

/// Map activity to themed room
fn activity_to_room(activity: &str) -> (&'static str, &'static str) {
    let activity_lower = activity.to_lowercase();
    if activity_lower.contains("music") || activity_lower.contains("guitar") || activity_lower.contains("piano") {
        ("music-lounge", "Music Lounge")
    } else if activity_lower.contains("art") || activity_lower.contains("draw") || activity_lower.contains("paint") {
        ("art-studio", "Art Studio")
    } else if activity_lower.contains("code") || activity_lower.contains("program") || activity_lower.contains("study") {
        ("focus-den", "Focus Den")
    } else if activity_lower.contains("game") || activity_lower.contains("gaming") {
        ("gaming-corner", "Gaming Corner")
    } else if activity_lower.contains("watching") || activity_lower.contains("movie") || activity_lower.contains("judge") || activity_lower.contains("judging") {
        ("cinema", "Cinema")
    } else if activity_lower.contains("party") || activity_lower.contains("city") || activity_lower.contains("walking") {
        ("city", "City")
    } else {
        ("hangout-hub", "Hangout Hub")
    }
}

#[derive(Deserialize)]
struct ClickRequest {
    message: String,
}

#[derive(Serialize)]
struct ClickResponse {
    response: String,
}

#[actix_web::get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().body("WebHangin Server - Ready to stream!")
}

async fn handle_click(payload: web::Json<ClickRequest>) -> web::Json<ClickResponse> {
    println!("🍩 Backend received click! Message: {}", payload.message);
    println!("🎉 Processing donut click at {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));

    let response = format!("Hello from the backend! You clicked at {}", chrono::Local::now().format("%H:%M:%S"));

    web::Json(ClickResponse { response })
}

async fn websocket_handler(
    req: HttpRequest,
    room_owner: Data<Mutex<RoomOwner<StreamingSession>>>,
    stream: web::Payload,
    query: Query<PlayerJoinQuery>,
) -> impl Responder {
    // Extract player data from query params
    let player_data = PlayerData {
        id: String::new(), // Will be set by Room::add_player
        name: query.name.clone(),
        color: query.color.clone(),
        activity: query.activity.clone(),
        facial_features: FacialFeatures {
            eye_style: query.eye_style.clone(),
            nose_style: query.nose_style.clone(),
            mouth_style: query.mouth_style.clone(),
            character_type: query.character_type.clone(),
        },
        position: Default::default(),
        rotation: 0.0,
        is_moving: false,
    };

    // Route to themed room based on activity
    let (room_id, room_theme) = activity_to_room(&query.activity);
    tracing::info!("Player {} joining room {} (activity: {})", query.name, room_id, query.activity);

    // Get ICE servers from the owner
    let ice_servers = {
        let owner = room_owner.lock().await;
        owner.get_ice_servers()
    };

    let find = room_owner
        .as_ref()
        .lock()
        .await
        .find_by_id(room_id.to_string());

    let mut config = MediaConfig::default();
    config.codec = CodecConfig {
        audio: audio_codecs(),
        video: video_codecs(),
    };

    match find {
        Some(room) => {
            tracing::info!("Room found, so joining it: {}", room_id);
            let server = StreamingSession::new(room, room_owner.clone(), player_data, ice_servers).await;
            ws::start(server, &req, stream)
        }
        None => {
            let owner = room_owner.clone();
            let mut owner = owner.lock().await;
            let room = owner.create_new_room(room_id.to_string(), room_theme.to_string(), config).await;
            drop(owner); // Release lock before creating session
            let server = StreamingSession::new(room, room_owner.clone(), player_data, ice_servers).await;
            ws::start(server, &req, stream)
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load environment variables from .env file (check both backend and frontend dirs)
    if dotenv::from_filename("../.env").is_err() {
        if dotenv::from_filename("../frontend/.env").is_err() {
            tracing::warn!("No .env file found, will use environment variables");
        }
    }

    // Initialize tracing - enable DTLS and WebRTC debug for connection issues
    // Set RUST_LOG=webrtc_dtls=debug,webrtc=debug for more verbose output
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "warn,backend=info,rheomesh=info,webrtc_dtls=debug,dtls=debug,webrtc::peer_connection=debug,webrtc::dtls_transport=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Fetch TURN servers from Xirsys
    println!("🔄 Fetching TURN servers from Xirsys...");
    let ice_servers = fetch_xirsys_ice_servers().await;
    println!("✅ Configured {} ICE server groups", ice_servers.len());

    // Initialize Rheomesh worker
    let worker = rheomesh::worker::Worker::new(rheomesh::config::WorkerConfig::default())
        .await
        .expect("Failed to create worker");
    let room_owner: RoomOwner<StreamingSession> = RoomOwner::new(worker, ice_servers);
    let room_data = Data::new(Mutex::new(room_owner));

    println!("🚀 WebHangin server starting on http://0.0.0.0:3001");
    println!("📡 WebSocket: ws://0.0.0.0:3001/stream");
    println!("🌐 Frontend: http://0.0.0.0:3001/");
    println!("💡 Run 'npm run build' in frontend/ to update the static files");

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header();

        App::new()
            .wrap(TracingLogger::default())
            .wrap(cors)
            // API routes first (these take precedence over static files)
            .route("/api/click", web::post().to(handle_click))
            .route("/stream", web::get().to(websocket_handler))
            // Serve Next.js static export from frontend/out
            .service(
                fs::Files::new("/", "../frontend/out")
                    .index_file("index.html")
                    .use_last_modified(true)
            )
            .app_data(room_data.clone())
    })
    .bind("0.0.0.0:3001")?
    .run()
    .await
}

fn audio_codecs() -> Vec<RTCRtpCodecParameters> {
    vec![
        RTCRtpCodecParameters {
            capability: RTCRtpCodecCapability {
                mime_type: media_engine::MIME_TYPE_OPUS.to_owned(),
                clock_rate: 48000,
                channels: 2,
                sdp_fmtp_line: "minptime=10;useinbandfec=1".to_owned(),
                rtcp_feedback: vec![],
            },
            payload_type: 111,
            ..Default::default()
        },
    ]
}

fn video_codecs() -> Vec<RTCRtpCodecParameters> {
    let video_rtcp_feedback = vec![
        RTCPFeedback {
            typ: "goog-remb".to_owned(),
            parameter: "".to_owned(),
        },
        RTCPFeedback {
            typ: "ccm".to_owned(),
            parameter: "fir".to_owned(),
        },
        RTCPFeedback {
            typ: "nack".to_owned(),
            parameter: "".to_owned(),
        },
        RTCPFeedback {
            typ: "nack".to_owned(),
            parameter: "pli".to_owned(),
        },
    ];
    vec![
        RTCRtpCodecParameters {
            capability: RTCRtpCodecCapability {
                mime_type: media_engine::MIME_TYPE_H264.to_owned(),
                clock_rate: 90000,
                channels: 0,
                sdp_fmtp_line:
                    "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f"
                        .to_owned(),
                rtcp_feedback: video_rtcp_feedback.clone(),
            },
            payload_type: 102,
            ..Default::default()
        },
    ]
}
