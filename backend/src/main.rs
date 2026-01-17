use axum::{
    routing::{get, post},
    Router,
    Json,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{CorsLayer, Any};

#[derive(Deserialize)]
struct ClickRequest {
    message: String,
}

#[derive(Serialize)]
struct ClickResponse {
    response: String,
}

async fn handle_click(Json(payload): Json<ClickRequest>) -> Json<ClickResponse> {
    println!("🍩 Backend received click! Message: {}", payload.message);
    println!("🎉 Processing donut click at {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));

    let response = format!("Hello from the backend! You clicked at {}", chrono::Local::now().format("%H:%M:%S"));

    Json(ClickResponse { response })
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/api/click", post(handle_click))
        .layer(cors);

    println!("🚀 Backend server starting on http://0.0.0.0:3001");

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
