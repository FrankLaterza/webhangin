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
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

use super::room::{Room, RoomOwner};

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
}

impl StreamingSession {
    pub async fn new(room: Arc<Room<Self>>, owner: Data<Mutex<RoomOwner<Self>>>, player_data: PlayerData) -> Self {
        let publish_transport;
        let subscribe_transport;
        {
            let router = room.router.lock().await;
            let config = rheomesh::config::WebRTCTransportConfig::default();
            publish_transport = router.create_publish_transport(config.clone()).await;
            subscribe_transport = router.create_subscribe_transport(config).await;
        }

        Self {
            owner,
            room,
            player_id: String::new(), // Set in started()
            player_data,
            publish_transport: Arc::new(publish_transport),
            subscribe_transport: Arc::new(subscribe_transport),
            publishers: Arc::new(Mutex::new(HashMap::new())),
            subscribers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Actor for StreamingSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        tracing::info!("New WebSocket connection started for player: {}", self.player_data.name);
        let address = ctx.address();
        
        // Add player to room and get assigned player_id
        self.player_id = self.room.add_player(address.clone(), self.player_data.clone());
        
        // Send room state to the new player
        let players = self.room.get_all_players();
        let room_theme = self.room.theme.clone();
        let your_player_id = self.player_id.clone();
        address.do_send(SendingMessage::RoomState { 
            your_player_id,
            players, 
            room_theme 
        });
        
        // Notify other players about the new player
        if let Some(new_player_data) = self.room.get_player_data(&self.player_id) {
            let peers = self.room.get_peers(&self.player_id);
            for peer in peers {
                peer.do_send(SendingMessage::PlayerJoined { 
                    player: new_player_data.clone() 
                });
            }
        }
    }

    fn stopped(&mut self, ctx: &mut Self::Context) {
        tracing::info!("WebSocket connection stopped for player: {}", self.player_data.name);
        let address = ctx.address();
        let subscribe_transport = self.subscribe_transport.clone();
        let publish_transport = self.publish_transport.clone();
        actix::spawn(async move {
            let _ = subscribe_transport.close().await;
            let _ = publish_transport.close().await;
        });
        
        // Notify peers before removing
        let player_id = self.player_id.clone();
        let peers = self.room.get_peers(&player_id);
        for peer in peers {
            peer.do_send(SendingMessage::PlayerLeft { 
                player_id: player_id.clone() 
            });
        }
        
        // Remove player from room
        if let Some((_, remaining)) = self.room.remove_player_by_addr(&address) {
            if remaining == 0 {
                let owner = self.owner.clone();
                let room_id = self.room.id.clone();
                actix::spawn(async move {
                    let mut owner = owner.lock().await;
                    owner.remove_room(room_id);
                });
            }
        }
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for StreamingSession {
    fn handle(&mut self, item: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match item {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Pong(_)) => tracing::debug!("pong received"),
            Ok(ws::Message::Text(text)) => match serde_json::from_str::<ReceivedMessage>(&text) {
                Ok(message) => {
                    ctx.address().do_send(message);
                }
                Err(error) => {
                    tracing::error!("failed to parse client message: {}\n{}", error, text);
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
        tracing::debug!("received message: {:?}", msg);

        match msg {
            ReceivedMessage::Ping => {
                address.do_send(SendingMessage::Pong);
            }
            ReceivedMessage::PublisherInit => {
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

                    let router = room.router.lock().await;
                    let ids = router.publisher_ids();
                    tracing::info!("router publisher ids {:#?}", ids);
                    // Send empty player_id for initial state since these are from all players
                    address.do_send(SendingMessage::Published { publisher_ids: ids, player_id: String::new() });
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
                let publish_transport = self.publish_transport.clone();
                actix::spawn(async move {
                    match publish_transport.get_answer(sdp).await {
                        Ok(answer) => {
                            address.do_send(SendingMessage::Answer { sdp: answer });
                        }
                        Err(e) => {
                            tracing::error!("failed to get answer: {}", e);
                        }
                    }
                });
            }
            ReceivedMessage::Subscribe { publisher_id } => {
                let subscribe_transport = self.subscribe_transport.clone();
                let subscribers = self.subscribers.clone();
                actix::spawn(async move {
                    match subscribe_transport.subscribe(publisher_id).await {
                        Ok((subscriber, offer)) => {
                            let id = subscriber.lock().await.id.clone();
                            subscribers.lock().await.insert(id.clone(), subscriber);
                            address.do_send(SendingMessage::Offer { sdp: offer });
                            address.do_send(SendingMessage::Subscribed { subscriber_id: id });
                        }
                        Err(e) => {
                            tracing::error!("failed to subscribe: {}", e);
                        }
                    }
                });
            }
            ReceivedMessage::Answer { sdp } => {
                let subscribe_transport = self.subscribe_transport.clone();
                actix::spawn(async move {
                    let _ = subscribe_transport.set_answer(sdp).await;
                });
            }
            ReceivedMessage::Publish { publisher_id } => {
                let room = self.room.clone();
                let player_id = self.player_id.clone();
                let publish_transport = self.publish_transport.clone();
                let publishers = self.publishers.clone();
                actix::spawn(async move {
                    match publish_transport.publish(publisher_id).await {
                        Ok(publisher) => {
                            let track_id = publisher.lock().await.track_id.clone();
                            tracing::debug!("published a track: {}", track_id);
                            publishers.lock().await.insert(track_id.clone(), publisher);
                            room.get_peers(&player_id).iter().for_each(|peer| {
                                peer.do_send(SendingMessage::Published {
                                    publisher_ids: vec![track_id.clone()],
                                    player_id: player_id.clone(),
                                });
                            });
                        }
                        Err(err) => {
                            tracing::error!("{}", err);
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
                        // Notify all peers that this publisher is gone
                        room.get_peers(&player_id).iter().for_each(|peer| {
                            peer.do_send(SendingMessage::Unpublished {
                                publisher_id: publisher_id.clone(),
                            });
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
                // Broadcast to all players including sender
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
                
                // Update position in room state
                room.update_player_position(&player_id, position.clone(), rotation, is_moving);
                
                // Broadcast to all peers
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
                
                // Broadcast animation to all peers (not to self)
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
        tracing::debug!("sending message: {:?}", msg);
        ctx.text(serde_json::to_string(&msg).expect("failed to parse SendingMessage"));
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
    Unpublished { publisher_id: String },
    #[serde(rename_all = "camelCase")]
    ChatMessage { sender: String, message: String },
    #[serde(rename_all = "camelCase")]
    RoomState { your_player_id: String, players: Vec<PlayerData>, room_theme: String },
    #[serde(rename_all = "camelCase")]
    PlayerJoined { player: PlayerData },
    #[serde(rename_all = "camelCase")]
    PlayerLeft { player_id: String },
    #[serde(rename_all = "camelCase")]
    PlayerMoved { player_id: String, position: Position, rotation: f32, is_moving: bool },
    #[serde(rename_all = "camelCase")]
    PlayerAnimation { player_id: String, animation: String },
}
