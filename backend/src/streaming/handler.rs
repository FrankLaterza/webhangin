use std::collections::HashMap;
use std::sync::Arc;
use actix::{Actor, AsyncContext, Handler, Message, StreamHandler};
use actix_web::web::Data;
use actix_web_actors::ws;
use rheomesh::publisher::Publisher;
use rheomesh::subscriber::Subscriber;
use rheomesh::transport::Transport;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::policy::ice_transport_policy::RTCIceTransportPolicy;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc_ice::network_type::NetworkType;

use super::room::{Room, RoomOwner};

/// ICE server configuration for WebRTC (serializable version for frontend)
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IceServerConfig {
    pub urls: Vec<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub username: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub credential: String,
}

impl From<&RTCIceServer> for IceServerConfig {
    fn from(server: &RTCIceServer) -> Self {
        IceServerConfig {
            urls: server.urls.clone(),
            username: server.username.clone(),
            credential: server.credential.clone(),
        }
    }
}

/// 3D position in the game world
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Position {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Facial feature customization options
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FacialFeatures {
    pub eye_style: String,
    pub nose_style: String,
    pub mouth_style: String,
    #[serde(default = "default_character_type")]
    pub character_type: String,
}

fn default_character_type() -> String {
    "cat".to_string()
}

/// Player data for game state
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlayerData {
    pub id: String,
    pub name: String,
    pub color: String,
    pub activity: String,
    pub facial_features: FacialFeatures,
    pub position: Position,
    pub rotation: f32,
    pub is_moving: bool,
}

/// WebSocket actor for handling streaming sessions
pub struct StreamingSession {
    owner: Data<Mutex<RoomOwner<Self>>>,
    room: Arc<Room<Self>>,
    player_id: String,
    player_data: PlayerData,
    publish_transport: Arc<rheomesh::publish_transport::PublishTransport>,
    subscribe_transport: Arc<rheomesh::subscribe_transport::SubscribeTransport>,
    publishers: Arc<Mutex<HashMap<String, Arc<Mutex<Publisher>>>>>,
    subscribers: Arc<Mutex<HashMap<String, Arc<Mutex<Subscriber>>>>>,
    ice_servers: Vec<IceServerConfig>,
}

impl StreamingSession {
    pub async fn new(room: Arc<Room<Self>>, owner: Data<Mutex<RoomOwner<Self>>>, player_data: PlayerData, ice_servers: Vec<RTCIceServer>) -> Self {
        let publish_transport;
        let subscribe_transport;
        {
            let router = room.router.lock().await;

            // Transport config - FORCE RELAY MODE to work around webrtc-rs DTLS issues
            // webrtc-rs has bugs in both active and passive DTLS modes that cause
            // intermittent handshake failures. By forcing all connections through TURN
            // relay, we get a more reliable network path.
            let mut config = rheomesh::config::WebRTCTransportConfig::default();
            config.configuration = RTCConfiguration {
                ice_servers: ice_servers.clone(),
                // CRITICAL: Force relay-only mode to bypass DTLS/NAT issues
                ice_transport_policy: RTCIceTransportPolicy::Relay,
                ..Default::default()
            };
            // IPv4 only - IPv6 causes Windows binding errors (os error 10049)
            config.network_types = vec![
                NetworkType::Udp4,
                NetworkType::Tcp4,
            ];
            // ICE timeouts
            config.ice_disconnected_timeout = Some(std::time::Duration::from_secs(30));
            config.ice_failed_timeout = Some(std::time::Duration::from_secs(60));
            config.ice_keep_alive_interval = Some(std::time::Duration::from_secs(2));

            tracing::info!("[SESSION] Using RELAY-ONLY mode (ice_transport_policy=Relay)");

            publish_transport = router.create_publish_transport(config.clone()).await;
            subscribe_transport = router.create_subscribe_transport(config).await;

            // DIAGNOSTIC: Log transport IDs for correlation
            tracing::info!("[SESSION] player={} pub={} sub={}",
                player_data.name, &publish_transport.id[..8], &subscribe_transport.id[..8]);
        }

        // Convert RTCIceServer to serializable IceServerConfig
        let ice_server_configs: Vec<IceServerConfig> = ice_servers.iter().map(|s| s.into()).collect();

        Self {
            owner,
            room,
            player_id: String::new(), // Set in started()
            player_data,
            publish_transport: Arc::new(publish_transport),
            subscribe_transport: Arc::new(subscribe_transport),
            publishers: Arc::new(Mutex::new(HashMap::new())),
            subscribers: Arc::new(Mutex::new(HashMap::new())),
            ice_servers: ice_server_configs,
        }
    }
}

impl Actor for StreamingSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let address = ctx.address();
        self.player_id = self.room.add_player(address.clone(), self.player_data.clone());

        tracing::info!("[JOINED] player={} id={}", self.player_data.name, &self.player_id[..8]);

        let players = self.room.get_all_players();
        address.do_send(SendingMessage::RoomState {
            your_player_id: self.player_id.clone(),
            players,
            room_theme: self.room.theme.clone(),
            ice_servers: self.ice_servers.clone(),
        });

        if let Some(new_player_data) = self.room.get_player_data(&self.player_id) {
            for peer in self.room.get_peers(&self.player_id) {
                peer.do_send(SendingMessage::PlayerJoined { player: new_player_data.clone() });
            }
        }
    }

    fn stopped(&mut self, ctx: &mut Self::Context) {
        tracing::info!("[LEFT] player={} id={}", self.player_data.name, &self.player_id[..8]);

        let address = ctx.address();
        let subscribe_transport = self.subscribe_transport.clone();
        let publish_transport = self.publish_transport.clone();
        let publishers = self.publishers.clone();
        let room = self.room.clone();
        let player_id = self.player_id.clone();

        actix::spawn(async move {
            let publisher_ids: Vec<String> = publishers.lock().await.keys().cloned().collect();
            for publisher_id in publisher_ids {
                if let Some(publisher) = publishers.lock().await.remove(&publisher_id) {
                    publisher.lock().await.close().await;
                    room.unregister_publisher(&publisher_id);
                    room.get_peers(&player_id).iter().for_each(|peer| {
                        peer.do_send(SendingMessage::Unpublished { publisher_id: publisher_id.clone() });
                    });
                }
            }
            let _ = subscribe_transport.close().await;
            let _ = publish_transport.close().await;
        });

        for peer in self.room.get_peers(&self.player_id) {
            peer.do_send(SendingMessage::PlayerLeft { player_id: self.player_id.clone() });
        }

        if let Some((_, remaining)) = self.room.remove_player_by_addr(&address) {
            if remaining == 0 {
                let owner = self.owner.clone();
                let room_id = self.room.id.clone();
                actix::spawn(async move {
                    owner.lock().await.remove_room(room_id);
                });
            }
        }
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for StreamingSession {
    fn handle(&mut self, item: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match item {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Pong(_)) => {},
            Ok(ws::Message::Text(text)) => {
                if let Ok(message) = serde_json::from_str::<ReceivedMessage>(&text) {
                    ctx.address().do_send(message);
                }
            },
            Ok(ws::Message::Binary(bin)) => ctx.binary(bin),
            Ok(ws::Message::Close(reason)) => ctx.close(reason),
            _ => (),
        }
    }
}

impl Handler<ReceivedMessage> for StreamingSession {
    type Result = ();

    fn handle(&mut self, msg: ReceivedMessage, ctx: &mut Self::Context) -> Self::Result {
        let address = ctx.address();
        let player_name = self.player_data.name.clone();

        match msg {
            ReceivedMessage::Ping => {
                address.do_send(SendingMessage::Pong);
            }
            ReceivedMessage::PublisherInit => {
                tracing::info!("[{}] PublisherInit", player_name);
                let publish_transport = self.publish_transport.clone();
                actix::spawn(async move {
                    publish_transport
                        .on_ice_candidate(Box::new(move |candidate| {
                            let init = candidate.to_json().expect("failed to parse candidate");
                            address.do_send(SendingMessage::PublisherIce { candidate: init });
                        }))
                        .await;
                });
            }
            ReceivedMessage::SubscriberInit => {
                tracing::info!("[{}] SubscriberInit", player_name);
                let subscribe_transport = self.subscribe_transport.clone();
                let room = self.room.clone();

                actix::spawn(async move {
                    let addr = address.clone();
                    let addr2 = address.clone();

                    subscribe_transport
                        .on_ice_candidate(Box::new(move |candidate| {
                            let init = candidate.to_json().expect("failed to parse candidate");
                            addr.do_send(SendingMessage::SubscriberIce { candidate: init });
                        }))
                        .await;

                    subscribe_transport
                        .on_negotiation_needed(Box::new(move |offer| {
                            addr2.do_send(SendingMessage::Offer { sdp: offer });
                        }))
                        .await;

                    // Send existing publishers grouped by player
                    let all_publishers = room.get_all_publishers();
                    let mut publishers_by_player: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
                    for (publisher_id, player_id) in all_publishers {
                        publishers_by_player.entry(player_id).or_insert_with(Vec::new).push(publisher_id);
                    }
                    for (player_id, publisher_ids) in publishers_by_player {
                        address.do_send(SendingMessage::Published { publisher_ids, player_id });
                    }
                });
            }
            ReceivedMessage::PublisherIce { candidate } => {
                let publish_transport = self.publish_transport.clone();
                actix::spawn(async move {
                    let _ = publish_transport.add_ice_candidate(candidate).await;
                });
            }
            ReceivedMessage::SubscriberIce { candidate } => {
                let subscribe_transport = self.subscribe_transport.clone();
                actix::spawn(async move {
                    let _ = subscribe_transport.add_ice_candidate(candidate).await;
                });
            }
            ReceivedMessage::Offer { sdp } => {
                tracing::info!("[{}] Offer len={}", player_name, sdp.sdp.len());
                let publish_transport = self.publish_transport.clone();
                let player = player_name.clone();
                actix::spawn(async move {
                    match publish_transport.get_answer(sdp).await {
                        Ok(answer) => {
                            tracing::info!("[{}] Answer sent", player);
                            address.do_send(SendingMessage::Answer { sdp: answer });
                        }
                        Err(e) => {
                            tracing::error!("[{}] Answer error: {}", player, e);
                        }
                    }
                });
            }
            ReceivedMessage::Subscribe { publisher_id } => {
                tracing::info!("[{}] Subscribe to {}", player_name, &publisher_id[..8.min(publisher_id.len())]);
                let subscribe_transport = self.subscribe_transport.clone();
                let subscribers = self.subscribers.clone();
                let player = player_name.clone();
                let pub_id = publisher_id.clone();

                actix::spawn(async move {
                    let max_retries = 5;
                    let mut last_error = String::new();

                    for attempt in 0..max_retries {
                        if attempt > 0 {
                            tokio::time::sleep(tokio::time::Duration::from_millis(100 * (1 << (attempt - 1)))).await;
                        }

                        match subscribe_transport.subscribe(pub_id.clone()).await {
                            Ok((subscriber, offer)) => {
                                let id = subscriber.lock().await.id.clone();
                                subscribers.lock().await.insert(id.clone(), subscriber);
                                address.do_send(SendingMessage::Offer { sdp: offer });
                                address.do_send(SendingMessage::Subscribed { subscriber_id: id });
                                return;
                            }
                            Err(e) => {
                                last_error = e.to_string();
                            }
                        }
                    }

                    tracing::error!("[{}] Subscribe failed: {}", player, last_error);
                    address.do_send(SendingMessage::SubscribeFailed { publisher_id: pub_id, error: last_error });
                });
            }
            ReceivedMessage::Answer { sdp } => {
                let subscribe_transport = self.subscribe_transport.clone();
                actix::spawn(async move {
                    let _ = subscribe_transport.set_answer(sdp).await;
                });
            }
            ReceivedMessage::Publish { publisher_id } => {
                let start = std::time::Instant::now();
                let pub_id_short = &publisher_id[..8.min(publisher_id.len())];
                tracing::info!("[{}] Publish track={}", player_name, pub_id_short);

                let room = self.room.clone();
                let player_id = self.player_id.clone();
                let publish_transport = self.publish_transport.clone();
                let publishers = self.publishers.clone();
                let player = player_name.clone();

                actix::spawn(async move {
                    // DIAGNOSTIC: 30s timeout to detect DTLS failures
                    let publish_result = tokio::time::timeout(
                        tokio::time::Duration::from_secs(30),
                        publish_transport.publish(publisher_id.clone())
                    ).await;

                    match publish_result {
                        Ok(Ok(publisher)) => {
                            let track_id = publisher.lock().await.track_id.clone();
                            let elapsed = start.elapsed();
                            // DIAGNOSTIC: Success with timing
                            tracing::info!("[{}] PUBLISH_OK track={} elapsed={:?}", player, &track_id[..8.min(track_id.len())], elapsed);

                            publishers.lock().await.insert(track_id.clone(), publisher);
                            room.register_publisher(track_id.clone(), player_id.clone());

                            let peers = room.get_peers(&player_id);
                            peers.iter().for_each(|peer| {
                                peer.do_send(SendingMessage::Published {
                                    publisher_ids: vec![track_id.clone()],
                                    player_id: player_id.clone(),
                                });
                            });
                        }
                        Ok(Err(err)) => {
                            // DIAGNOSTIC: Publish error
                            tracing::error!("[{}] PUBLISH_ERR elapsed={:?} err={}", player, start.elapsed(), err);
                        }
                        Err(_) => {
                            // DIAGNOSTIC: Timeout - on_track never fired, likely DTLS issue
                            tracing::error!("[{}] PUBLISH_TIMEOUT 30s - on_track never fired (DTLS failure?)", player);
                        }
                    }
                });
            }
            ReceivedMessage::StopPublish { publisher_id } => {
                let room = self.room.clone();
                let player_id = self.player_id.clone();
                let publishers = self.publishers.clone();
                actix::spawn(async move {
                    if let Some(publisher) = publishers.lock().await.remove(&publisher_id) {
                        publisher.lock().await.close().await;
                        room.unregister_publisher(&publisher_id);
                        room.get_peers(&player_id).iter().for_each(|peer| {
                            peer.do_send(SendingMessage::Unpublished { publisher_id: publisher_id.clone() });
                        });
                    }
                });
            }
            ReceivedMessage::StopSubscribe { subscriber_id } => {
                let subscribers = self.subscribers.clone();
                actix::spawn(async move {
                    if let Some(subscriber) = subscribers.lock().await.remove(&subscriber_id) {
                        subscriber.lock().await.close().await;
                    }
                });
            }
            ReceivedMessage::ChatMessage { message } => {
                let room = self.room.clone();
                let sender = self.player_data.name.clone();
                room.get_all_addrs().iter().for_each(|peer| {
                    peer.do_send(SendingMessage::ChatMessage {
                        sender: sender.clone(),
                        message: message.clone(),
                    });
                });
            }
            ReceivedMessage::PlayerMove { position, rotation, is_moving } => {
                let room = self.room.clone();
                let player_id = self.player_id.clone();
                room.update_player_position(&player_id, position.clone(), rotation, is_moving);
                room.get_peers(&player_id).iter().for_each(|peer| {
                    peer.do_send(SendingMessage::PlayerMoved {
                        player_id: player_id.clone(),
                        position: position.clone(),
                        rotation,
                        is_moving,
                    });
                });
            }
            ReceivedMessage::PlayAnimation { animation } => {
                let room = self.room.clone();
                let player_id = self.player_id.clone();
                room.get_peers(&player_id).iter().for_each(|peer| {
                    peer.do_send(SendingMessage::PlayerAnimation {
                        player_id: player_id.clone(),
                        animation: animation.clone(),
                    });
                });
            }
        }
    }
}

impl Handler<SendingMessage> for StreamingSession {
    type Result = ();

    fn handle(&mut self, msg: SendingMessage, ctx: &mut Self::Context) -> Self::Result {
        ctx.text(serde_json::to_string(&msg).expect("failed to serialize SendingMessage"));
    }
}

/// Messages received from the client
#[derive(Deserialize, Message, Debug)]
#[serde(tag = "action")]
#[rtype(result = "()")]
enum ReceivedMessage {
    #[serde(rename_all = "camelCase")]
    Ping,
    #[serde(rename_all = "camelCase")]
    PublisherInit,
    #[serde(rename_all = "camelCase")]
    SubscriberInit,
    #[serde(rename_all = "camelCase")]
    PublisherIce { candidate: RTCIceCandidateInit },
    #[serde(rename_all = "camelCase")]
    SubscriberIce { candidate: RTCIceCandidateInit },
    #[serde(rename_all = "camelCase")]
    Offer { sdp: RTCSessionDescription },
    #[serde(rename_all = "camelCase")]
    Subscribe { publisher_id: String },
    #[serde(rename_all = "camelCase")]
    Answer { sdp: RTCSessionDescription },
    #[serde(rename_all = "camelCase")]
    Publish { publisher_id: String },
    #[serde(rename_all = "camelCase")]
    StopPublish { publisher_id: String },
    #[serde(rename_all = "camelCase")]
    StopSubscribe { subscriber_id: String },
    #[serde(rename_all = "camelCase")]
    ChatMessage { message: String },
    #[serde(rename_all = "camelCase")]
    PlayerMove { position: Position, rotation: f32, is_moving: bool },
    #[serde(rename_all = "camelCase")]
    PlayAnimation { animation: String },
}

/// Messages sent to the client
#[derive(Serialize, Message, Debug)]
#[serde(tag = "action")]
#[rtype(result = "()")]
enum SendingMessage {
    #[serde(rename_all = "camelCase")]
    Pong,
    #[serde(rename_all = "camelCase")]
    Answer { sdp: RTCSessionDescription },
    #[serde(rename_all = "camelCase")]
    Offer { sdp: RTCSessionDescription },
    #[serde(rename_all = "camelCase")]
    PublisherIce { candidate: RTCIceCandidateInit },
    #[serde(rename_all = "camelCase")]
    SubscriberIce { candidate: RTCIceCandidateInit },
    #[serde(rename_all = "camelCase")]
    Published { publisher_ids: Vec<String>, player_id: String },
    #[serde(rename_all = "camelCase")]
    Subscribed { subscriber_id: String },
    #[serde(rename_all = "camelCase")]
    SubscribeFailed { publisher_id: String, error: String },
    #[serde(rename_all = "camelCase")]
    Unpublished { publisher_id: String },
    #[serde(rename_all = "camelCase")]
    ChatMessage { sender: String, message: String },
    #[serde(rename_all = "camelCase")]
    RoomState { your_player_id: String, players: Vec<PlayerData>, room_theme: String, ice_servers: Vec<IceServerConfig> },
    #[serde(rename_all = "camelCase")]
    PlayerJoined { player: PlayerData },
    #[serde(rename_all = "camelCase")]
    PlayerLeft { player_id: String },
    #[serde(rename_all = "camelCase")]
    PlayerMoved { player_id: String, position: Position, rotation: f32, is_moving: bool },
    #[serde(rename_all = "camelCase")]
    PlayerAnimation { player_id: String, animation: String },
}
