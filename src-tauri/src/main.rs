// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Future LAN sharing entry point (recommended stack: Axum + Tokio).
// This placeholder keeps architecture intent explicit without enabling server runtime yet.
#[allow(dead_code)]
fn start_lan_server() {
    // TODO: start lightweight LAN HTTP server for iPad/other device access on same Wi-Fi.
    // Recommended: Axum (routing + static/file responses + middleware ergonomics).
}

fn main() {
    app_lib::run();
}
