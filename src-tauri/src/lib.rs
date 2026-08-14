mod database;
mod models;
mod ranging;
mod scanner;

use std::{fs, sync::Arc};

use chrono::Utc;
use database::Database;
use models::{AppSettings, CalibrationProfile, DeviceSnapshot, ObservationBucket, ScanStatus};
use scanner::ScannerService;
use tauri::{AppHandle, Manager, State};
use tokio::sync::RwLock;

struct AppState {
    scanner: Arc<ScannerService>,
    database: Arc<Database>,
    settings: Arc<RwLock<AppSettings>>,
}

#[tauri::command]
async fn start_scan(app: AppHandle, state: State<'_, AppState>) -> Result<ScanStatus, String> {
    state
        .scanner
        .start(
            app,
            Arc::clone(&state.database),
            Arc::clone(&state.settings),
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn stop_scan(app: AppHandle, state: State<'_, AppState>) -> Result<ScanStatus, String> {
    state
        .scanner
        .stop(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_scan_status(state: State<'_, AppState>) -> Result<ScanStatus, String> {
    Ok(state.scanner.status().await)
}

#[tauri::command]
async fn get_devices(state: State<'_, AppState>) -> Result<Vec<DeviceSnapshot>, String> {
    Ok(state.scanner.snapshots().await)
}

#[tauri::command(rename_all = "camelCase")]
async fn get_device_history(
    device_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<ObservationBucket>, String> {
    state
        .database
        .get_history(&device_id, limit.unwrap_or(240).clamp(1, 5_000))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_calibration(
    mut profile: CalibrationProfile,
    state: State<'_, AppState>,
) -> Result<CalibrationProfile, String> {
    if !matches!(profile.scope.as_str(), "global" | "device") {
        return Err("calibration scope must be global or device".into());
    }
    if profile.scope == "device" && profile.device_id.is_none() {
        return Err("device calibration requires a device identifier".into());
    }
    if !(-120.0..=-20.0).contains(&profile.reference_rssi) {
        return Err("reference RSSI must be between -120 and -20 dBm".into());
    }
    if !(1.2..=6.0).contains(&profile.path_loss_exponent) {
        return Err("path-loss exponent must be between 1.2 and 6.0".into());
    }
    profile.created_at = Utc::now().timestamp_millis();
    let saved = state
        .database
        .save_calibration(&profile)
        .map_err(|error| error.to_string())?;
    let profiles = state
        .database
        .load_calibrations()
        .map_err(|error| error.to_string())?;
    state.scanner.replace_calibrations(profiles).await;
    Ok(saved)
}

#[tauri::command]
async fn get_calibrations(state: State<'_, AppState>) -> Result<Vec<CalibrationProfile>, String> {
    state
        .database
        .load_calibrations()
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn delete_calibration(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    state
        .database
        .delete_calibration(id)
        .map_err(|error| error.to_string())?;
    let profiles = state
        .database
        .load_calibrations()
        .map_err(|error| error.to_string())?;
    state.scanner.replace_calibrations(profiles).await;
    Ok(())
}

#[tauri::command]
async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(state.settings.read().await.clone())
}

#[tauri::command]
async fn update_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    if !(1.0..=100.0).contains(&settings.max_distance) {
        return Err("maximum distance must be between 1 and 100 meters".into());
    }
    if !(1.2..=6.0).contains(&settings.default_path_loss_exponent) {
        return Err("path-loss exponent must be between 1.2 and 6.0".into());
    }
    if !(20.0..=72.0).contains(&settings.marker_size) {
        return Err("marker size must be between 20 and 72 pixels".into());
    }
    state
        .database
        .save_settings(&settings)
        .map_err(|error| error.to_string())?;
    *state.settings.write().await = settings.clone();
    Ok(settings)
}

#[tauri::command]
async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state
        .database
        .clear_history()
        .map_err(|error| error.to_string())?;
    state.scanner.reset_history_buckets().await;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
async fn set_device_alias(
    device_id: String,
    alias: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let normalized = alias
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    state
        .database
        .set_alias(&device_id, normalized.as_deref())
        .map_err(|error| error.to_string())?;
    state.scanner.set_alias(&device_id, normalized).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data)?;
            let database = Arc::new(Database::open(&app_data.join("ble3d.sqlite3"))?);
            database.compact_old_buckets(Utc::now().timestamp_millis())?;
            let settings = database.load_settings()?;
            let calibrations = database.load_calibrations()?;
            app.manage(AppState {
                scanner: ScannerService::new(calibrations),
                database,
                settings: Arc::new(RwLock::new(settings)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_scan,
            stop_scan,
            get_scan_status,
            get_devices,
            get_device_history,
            save_calibration,
            get_calibrations,
            delete_calibration,
            get_settings,
            update_settings,
            clear_history,
            set_device_alias,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BLE3D");
}
