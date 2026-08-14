use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AppSettings {
    pub simulation_enabled: bool,
    pub max_distance: f64,
    pub default_reference_rssi: f64,
    pub default_path_loss_exponent: f64,
    pub show_unnamed: bool,
    pub show_unidentified: bool,
    pub marker_size: f64,
    pub recording_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            simulation_enabled: false,
            max_distance: 30.0,
            default_reference_rssi: -59.0,
            default_path_loss_exponent: 2.2,
            show_unnamed: true,
            show_unidentified: false,
            marker_size: 36.0,
            recording_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub state: String,
    pub adapter_name: Option<String>,
    pub permission: String,
    pub message: Option<String>,
    pub error_code: Option<String>,
    pub simulated: bool,
}

impl Default for ScanStatus {
    fn default() -> Self {
        Self {
            state: "stopped".into(),
            adapter_name: None,
            permission: "unknown".into(),
            message: Some("Ready to scan".into()),
            error_code: None,
            simulated: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyntheticPosition {
    pub radius: f64,
    pub azimuth: f64,
    pub elevation: f64,
    pub bearing_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub id: String,
    pub name: Option<String>,
    pub advertisement_name: Option<String>,
    pub alias: Option<String>,
    pub rssi: i16,
    pub filtered_rssi: f64,
    pub tx_power: Option<i16>,
    pub distance_meters: f64,
    pub uncertainty_meters: f64,
    pub confidence: String,
    pub calibration_source: String,
    pub last_seen: i64,
    pub first_seen: i64,
    pub state: String,
    pub manufacturer_ids: Vec<u16>,
    pub manufacturer_data: HashMap<u16, Vec<u8>>,
    pub service_uuids: Vec<String>,
    pub service_data: HashMap<String, Vec<u8>>,
    pub device_class: Option<u32>,
    pub position: SyntheticPosition,
    pub sample_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ObservationBucket {
    pub device_id: String,
    pub bucket_start: i64,
    pub bucket_seconds: i64,
    pub min_rssi: f64,
    pub max_rssi: f64,
    pub avg_rssi: f64,
    pub avg_distance: f64,
    pub sample_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationProfile {
    pub id: Option<i64>,
    pub scope: String,
    pub device_id: Option<String>,
    pub reference_rssi: f64,
    pub path_loss_exponent: f64,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct AdvertisementInput {
    pub id: String,
    pub name: Option<String>,
    pub advertisement_name: Option<String>,
    pub rssi: i16,
    pub tx_power: Option<i16>,
    pub manufacturer_ids: Vec<u16>,
    pub manufacturer_data: HashMap<u16, Vec<u8>>,
    pub service_uuids: Vec<String>,
    pub service_data: HashMap<String, Vec<u8>>,
    pub device_class: Option<u32>,
    pub observed_at: i64,
}

#[derive(Debug, Clone)]
pub struct PendingBucket {
    pub bucket_start: i64,
    pub min_rssi: f64,
    pub max_rssi: f64,
    pub sum_rssi: f64,
    pub sum_distance: f64,
    pub sample_count: i64,
}

impl PendingBucket {
    pub fn new(bucket_start: i64, rssi: f64, distance: f64) -> Self {
        Self {
            bucket_start,
            min_rssi: rssi,
            max_rssi: rssi,
            sum_rssi: rssi,
            sum_distance: distance,
            sample_count: 1,
        }
    }

    pub fn push(&mut self, rssi: f64, distance: f64) {
        self.min_rssi = self.min_rssi.min(rssi);
        self.max_rssi = self.max_rssi.max(rssi);
        self.sum_rssi += rssi;
        self.sum_distance += distance;
        self.sample_count += 1;
    }

    pub fn into_observation(self, device_id: String) -> ObservationBucket {
        ObservationBucket {
            device_id,
            bucket_start: self.bucket_start,
            bucket_seconds: 10,
            min_rssi: self.min_rssi,
            max_rssi: self.max_rssi,
            avg_rssi: self.sum_rssi / self.sample_count as f64,
            avg_distance: self.sum_distance / self.sample_count as f64,
            sample_count: self.sample_count,
        }
    }
}
