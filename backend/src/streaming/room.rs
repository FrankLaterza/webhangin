use std::collections::HashMap;
use std::sync::Arc;
use actix::{Actor, Addr};
use tokio::sync::Mutex;
use rheomesh::config::MediaConfig;
use rheomesh::router::Router;
use rheomesh::worker::Worker;
use webrtc::ice_transport::ice_server::RTCIceServer;

use super::handler::{PlayerData, Position};

/// A room represents a virtual meeting space where users can publish and subscribe to media
pub struct Room<T>
where
    T: Actor,
{
    pub id: String,
    pub theme: String,
    pub router: Arc<Mutex<Router>>,
    /// Maps player_id -> (actor address, player data)
    players: std::sync::Mutex<HashMap<String, (Addr<T>, PlayerData)>>,
    /// Maps publisher_id -> player_id (tracks which player owns which publisher)
    publishers: std::sync::Mutex<HashMap<String, String>>,
}

impl<T> Room<T>
where
    T: Actor,
{
    pub fn new(id: String, theme: String, router: Arc<Mutex<Router>>) -> Self {
        Self {
            id,
            theme,
            router,
            players: std::sync::Mutex::new(HashMap::new()),
            publishers: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Add a player to the room, returns the player's ID
    pub fn add_player(&self, addr: Addr<T>, mut player_data: PlayerData) -> String {
        let player_id = uuid::Uuid::new_v4().to_string();
        player_data.id = player_id.clone();
        player_data.position = Position::default();
        player_data.rotation = 0.0;
        player_data.is_moving = false;
        
        let mut players = self.players.lock().unwrap();
        players.insert(player_id.clone(), (addr, player_data));
        tracing::info!("Player {} joined room {}. Total players: {}", player_id, self.id, players.len());
        player_id
    }

    /// Remove a player from the room, returns remaining player count
    #[allow(dead_code)]
    pub fn remove_player(&self, player_id: &str) -> usize {
        let mut players = self.players.lock().unwrap();
        players.remove(player_id);
        let remaining = players.len();
        tracing::info!("Player {} left room {}. Remaining players: {}", player_id, self.id, remaining);
        remaining
    }

    /// Remove a player by their actor address, returns (player_id, remaining count) if found
    pub fn remove_player_by_addr(&self, addr: &Addr<T>) -> Option<(String, usize)> {
        let mut players = self.players.lock().unwrap();
        let player_id = players.iter()
            .find(|(_, (a, _))| a == addr)
            .map(|(id, _)| id.clone());
        
        if let Some(ref id) = player_id {
            players.remove(id);
            let remaining = players.len();
            tracing::info!("Player {} left room {}. Remaining players: {}", id, self.id, remaining);
            return Some((id.clone(), remaining));
        }
        None
    }

    pub fn update_player_position(&self, player_id: &str, position: Position, rotation: f32, is_moving: bool) {
        let mut players = self.players.lock().unwrap();
        if let Some((_, player_data)) = players.get_mut(player_id) {
            player_data.position = position;
            player_data.rotation = rotation;
            player_data.is_moving = is_moving;
        }
    }

    pub fn get_player_data(&self, player_id: &str) -> Option<PlayerData> {
        let players = self.players.lock().unwrap();
        players.get(player_id).map(|(_, data)| data.clone())
    }

    pub fn get_all_players(&self) -> Vec<PlayerData> {
        let players = self.players.lock().unwrap();
        players.values().map(|(_, data)| data.clone()).collect()
    }

    pub fn get_peers(&self, player_id: &str) -> Vec<Addr<T>> {
        let players = self.players.lock().unwrap();
        players.iter()
            .filter(|(id, _)| *id != player_id)
            .map(|(_, (addr, _))| addr.clone())
            .collect()
    }

    pub fn get_all_addrs(&self) -> Vec<Addr<T>> {
        let players = self.players.lock().unwrap();
        players.values().map(|(addr, _)| addr.clone()).collect()
    }

    /// Register a publisher for a player
    pub fn register_publisher(&self, publisher_id: String, player_id: String) {
        let mut publishers = self.publishers.lock().unwrap();
        publishers.insert(publisher_id.clone(), player_id.clone());
        tracing::debug!("Registered publisher {} for player {}", publisher_id, player_id);
    }

    /// Unregister a publisher
    pub fn unregister_publisher(&self, publisher_id: &str) {
        let mut publishers = self.publishers.lock().unwrap();
        publishers.remove(publisher_id);
        tracing::debug!("Unregistered publisher {}", publisher_id);
    }

    /// Get all publishers with their player IDs
    pub fn get_all_publishers(&self) -> Vec<(String, String)> {
        let publishers = self.publishers.lock().unwrap();
        publishers.iter().map(|(pub_id, player_id)| (pub_id.clone(), player_id.clone())).collect()
    }
}

/// RoomOwner manages all active rooms and creates new rooms on demand
pub struct RoomOwner<T>
where
    T: Actor,
{
    rooms: HashMap<String, Arc<Room<T>>>,
    worker: Arc<Mutex<Worker>>,
    ice_servers: Vec<RTCIceServer>,
}

impl<T> RoomOwner<T>
where
    T: Actor,
{
    pub fn new(worker: Arc<Mutex<Worker>>, ice_servers: Vec<RTCIceServer>) -> Self {
        Self {
            rooms: HashMap::new(),
            worker,
            ice_servers,
        }
    }

    pub fn get_ice_servers(&self) -> Vec<RTCIceServer> {
        self.ice_servers.clone()
    }

    pub fn find_by_id(&self, room_id: String) -> Option<Arc<Room<T>>> {
        self.rooms.get(&room_id).cloned()
    }

    pub async fn create_new_room(&mut self, room_id: String, theme: String, config: MediaConfig) -> Arc<Room<T>> {
        let mut worker = self.worker.lock().await;
        let router = worker.new_router(config);
        let room = Arc::new(Room::new(room_id.clone(), theme.clone(), router));

        self.rooms.insert(room_id.clone(), room.clone());
        tracing::info!("Created new room: {} (theme: {})", room_id, theme);

        room
    }

    pub fn remove_room(&mut self, room_id: String) {
        self.rooms.remove(&room_id);
        tracing::info!("Removed room: {}", room_id);
    }
}
