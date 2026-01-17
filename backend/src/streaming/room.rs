use std::collections::HashMap;
use std::sync::Arc;
use actix::{Actor, Addr};
use tokio::sync::Mutex;
use rheomesh::config::MediaConfig;
use rheomesh::router::Router;
use rheomesh::worker::Worker;

/// A room represents a virtual meeting space where users can publish and subscribe to media
pub struct Room<T>
where
    T: Actor,
{
    pub id: String,
    pub router: Arc<Mutex<Router>>,
    users: std::sync::Mutex<Vec<Addr<T>>>,
}

impl<T> Room<T>
where
    T: Actor,
{
    pub fn new(id: String, router: Arc<Mutex<Router>>) -> Self {
        Self {
            id,
            router,
            users: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub fn add_user(&self, addr: Addr<T>) {
        let mut users = self.users.lock().unwrap();
        users.push(addr);
        tracing::info!("User joined room {}. Total users: {}", self.id, users.len());
    }

    pub fn remove_user(&self, addr: Addr<T>) -> usize {
        let mut users = self.users.lock().unwrap();
        users.retain(|u| u != &addr);
        let remaining = users.len();
        tracing::info!("User left room {}. Remaining users: {}", self.id, remaining);
        remaining
    }

    pub fn get_peers(&self, addr: &Addr<T>) -> Vec<Addr<T>> {
        let users = self.users.lock().unwrap();
        users.iter().filter(|u| u != &addr).cloned().collect()
    }
}

/// RoomOwner manages all active rooms and creates new rooms on demand
pub struct RoomOwner<T>
where
    T: Actor,
{
    rooms: HashMap<String, Arc<Room<T>>>,
    worker: Arc<Mutex<Worker>>,
}

impl<T> RoomOwner<T>
where
    T: Actor,
{
    pub fn new(worker: Arc<Mutex<Worker>>) -> Self {
        Self {
            rooms: HashMap::new(),
            worker,
        }
    }

    pub fn find_by_id(&self, room_id: String) -> Option<Arc<Room<T>>> {
        self.rooms.get(&room_id).cloned()
    }

    pub async fn create_new_room(&mut self, room_id: String, config: MediaConfig) -> Arc<Room<T>> {
        let mut worker = self.worker.lock().await;
        let router = worker.new_router(config);
        let room = Arc::new(Room::new(room_id.clone(), router));

        self.rooms.insert(room_id.clone(), room.clone());
        tracing::info!("Created new room: {}", room_id);

        room
    }

    pub fn remove_room(&mut self, room_id: String) {
        self.rooms.remove(&room_id);
        tracing::info!("Removed room: {}", room_id);
    }
}
