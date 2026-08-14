use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use btleplug::{
    api::{Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter},
    platform::Manager,
};
use chrono::Utc;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, RwLock};

use crate::{
    database::Database,
    models::{
        AdvertisementInput, AppSettings, CalibrationProfile, DeviceSnapshot, PendingBucket,
        ScanStatus,
    },
    ranging::{estimate_range, synthetic_position, SignalFilter},
};

struct DeviceTracker {
    snapshot: DeviceSnapshot,
    filter: SignalFilter,
    pending: Option<PendingBucket>,
}

impl DeviceTracker {
    fn new(
        input: AdvertisementInput,
        alias: Option<String>,
        settings: &AppSettings,
        calibrations: &[CalibrationProfile],
    ) -> Self {
        let mut filter = SignalFilter::default();
        let filtered = filter.update(input.rssi);
        let estimate = estimate_range(
            &input.id,
            filtered.filtered_rssi,
            filtered.standard_deviation,
            filtered.sample_count,
            input.tx_power,
            settings,
            calibrations,
        );
        let bucket_start = (input.observed_at / 10_000) * 10_000;
        let pending = PendingBucket::new(bucket_start, filtered.filtered_rssi, estimate.distance);
        Self {
            snapshot: DeviceSnapshot {
                id: input.id.clone(),
                name: input.name,
                advertisement_name: input.advertisement_name,
                alias,
                rssi: input.rssi,
                filtered_rssi: filtered.filtered_rssi,
                tx_power: input.tx_power,
                distance_meters: estimate.distance,
                uncertainty_meters: estimate.uncertainty,
                confidence: estimate.confidence,
                calibration_source: estimate.source,
                last_seen: input.observed_at,
                first_seen: input.observed_at,
                state: "active".into(),
                manufacturer_ids: input.manufacturer_ids,
                manufacturer_data: input.manufacturer_data,
                service_uuids: input.service_uuids,
                service_data: input.service_data,
                device_class: input.device_class,
                position: synthetic_position(&input.id, estimate.distance),
                sample_count: 1,
            },
            filter,
            pending: Some(pending),
        }
    }

    fn observe(
        &mut self,
        input: AdvertisementInput,
        settings: &AppSettings,
        calibrations: &[CalibrationProfile],
    ) -> Option<PendingBucket> {
        let filtered = self.filter.update(input.rssi);
        let estimate = estimate_range(
            &input.id,
            filtered.filtered_rssi,
            filtered.standard_deviation,
            filtered.sample_count,
            input.tx_power,
            settings,
            calibrations,
        );

        if input.name.is_some() {
            self.snapshot.name = input.name;
        }
        if input.advertisement_name.is_some() {
            self.snapshot.advertisement_name = input.advertisement_name;
        }
        if !input.manufacturer_ids.is_empty() {
            self.snapshot.manufacturer_ids = input.manufacturer_ids;
        }
        if !input.manufacturer_data.is_empty() {
            self.snapshot.manufacturer_data = input.manufacturer_data;
        }
        if !input.service_uuids.is_empty() {
            self.snapshot.service_uuids = input.service_uuids;
        }
        if !input.service_data.is_empty() {
            self.snapshot.service_data = input.service_data;
        }
        self.snapshot.device_class = input.device_class.or(self.snapshot.device_class);
        self.snapshot.rssi = input.rssi;
        self.snapshot.filtered_rssi = filtered.filtered_rssi;
        self.snapshot.tx_power = input.tx_power.or(self.snapshot.tx_power);
        self.snapshot.distance_meters = estimate.distance;
        self.snapshot.uncertainty_meters = estimate.uncertainty;
        self.snapshot.confidence = estimate.confidence;
        self.snapshot.calibration_source = estimate.source;
        self.snapshot.last_seen = input.observed_at;
        self.snapshot.state = "active".into();
        self.snapshot.position = synthetic_position(&input.id, estimate.distance);
        self.snapshot.sample_count += 1;

        let bucket_start = (input.observed_at / 10_000) * 10_000;
        match &mut self.pending {
            Some(bucket) if bucket.bucket_start == bucket_start => {
                bucket.push(filtered.filtered_rssi, estimate.distance);
                None
            }
            Some(_) => self.pending.replace(PendingBucket::new(
                bucket_start,
                filtered.filtered_rssi,
                estimate.distance,
            )),
            None => {
                self.pending = Some(PendingBucket::new(
                    bucket_start,
                    filtered.filtered_rssi,
                    estimate.distance,
                ));
                None
            }
        }
    }
}

pub struct ScannerService {
    devices: RwLock<HashMap<String, DeviceTracker>>,
    status: RwLock<ScanStatus>,
    calibrations: RwLock<Vec<CalibrationProfile>>,
    stop_sender: Mutex<Option<oneshot::Sender<()>>>,
    running: AtomicBool,
}

impl ScannerService {
    pub fn new(calibrations: Vec<CalibrationProfile>) -> Arc<Self> {
        Arc::new(Self {
            devices: RwLock::new(HashMap::new()),
            status: RwLock::new(ScanStatus::default()),
            calibrations: RwLock::new(calibrations),
            stop_sender: Mutex::new(None),
            running: AtomicBool::new(false),
        })
    }

    pub async fn start(
        self: &Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        settings: Arc<RwLock<AppSettings>>,
    ) -> Result<ScanStatus> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Ok(self.status.read().await.clone());
        }

        let current_settings = settings.read().await.clone();
        if current_settings.simulation_enabled && !cfg!(debug_assertions) {
            self.running.store(false, Ordering::SeqCst);
            return Err(anyhow!(
                "the simulated scanner is available only in development builds"
            ));
        }

        let status = ScanStatus {
            state: "starting".into(),
            adapter_name: None,
            permission: if current_settings.simulation_enabled {
                "not-required".into()
            } else {
                "unknown".into()
            },
            message: Some(if current_settings.simulation_enabled {
                "Starting simulated advertisements".into()
            } else {
                "Requesting Bluetooth access".into()
            }),
            error_code: None,
            simulated: current_settings.simulation_enabled,
        };
        self.set_status(&app, status.clone()).await;

        let (stop_sender, stop_receiver) = oneshot::channel();
        *self
            .stop_sender
            .lock()
            .map_err(|_| anyhow!("scanner stop mutex was poisoned"))? = Some(stop_sender);

        let scanner = Arc::clone(self);
        tokio::spawn(async move {
            let simulated = current_settings.simulation_enabled;
            let result = if simulated {
                scanner
                    .clone()
                    .run_simulation(app.clone(), database.clone(), settings, stop_receiver)
                    .await
            } else {
                scanner
                    .clone()
                    .run_real(app.clone(), database.clone(), settings, stop_receiver)
                    .await
            };

            scanner.flush_all(&database).await;
            scanner.running.store(false, Ordering::SeqCst);
            if let Err(error) = result {
                let message = error.to_string();
                let lower = message.to_lowercase();
                let permission = if lower.contains("permission") || lower.contains("authoriz") {
                    "denied"
                } else {
                    "unknown"
                };
                scanner
                    .set_status(
                        &app,
                        ScanStatus {
                            state: "error".into(),
                            adapter_name: None,
                            permission: permission.into(),
                            message: Some(message),
                            error_code: Some(if permission == "denied" {
                                "permission-denied".into()
                            } else {
                                "scan-failed".into()
                            }),
                            simulated,
                        },
                    )
                    .await;
            } else {
                scanner
                    .set_status(
                        &app,
                        ScanStatus {
                            state: "stopped".into(),
                            adapter_name: None,
                            permission: if simulated {
                                "not-required".into()
                            } else {
                                "granted".into()
                            },
                            message: Some("Scan stopped".into()),
                            error_code: None,
                            simulated,
                        },
                    )
                    .await;
            }
        });

        Ok(status)
    }

    pub async fn stop(&self, app: &AppHandle) -> Result<ScanStatus> {
        let sender = self
            .stop_sender
            .lock()
            .map_err(|_| anyhow!("scanner stop mutex was poisoned"))?
            .take();
        if let Some(sender) = sender {
            let _ = sender.send(());
        }
        let mut status = self.status.read().await.clone();
        status.state = "stopping".into();
        status.message = Some("Stopping discovery".into());
        self.set_status(app, status.clone()).await;
        Ok(status)
    }

    pub async fn status(&self) -> ScanStatus {
        self.status.read().await.clone()
    }

    pub async fn snapshots(&self) -> Vec<DeviceSnapshot> {
        let now = Utc::now().timestamp_millis();
        let mut devices = self.devices.write().await;
        devices.retain(|_, tracker| now - tracker.snapshot.last_seen <= 30_000);
        for tracker in devices.values_mut() {
            tracker.snapshot.state = if now - tracker.snapshot.last_seen > 10_000 {
                "stale".into()
            } else {
                "active".into()
            };
        }
        let mut snapshots: Vec<_> = devices
            .values()
            .map(|tracker| tracker.snapshot.clone())
            .collect();
        snapshots.sort_by(|left, right| {
            left.distance_meters
                .total_cmp(&right.distance_meters)
                .then_with(|| left.id.cmp(&right.id))
        });
        snapshots
    }

    pub async fn replace_calibrations(&self, profiles: Vec<CalibrationProfile>) {
        *self.calibrations.write().await = profiles;
    }

    pub async fn set_alias(&self, device_id: &str, alias: Option<String>) {
        if let Some(tracker) = self.devices.write().await.get_mut(device_id) {
            tracker.snapshot.alias = alias;
        }
    }

    pub async fn reset_history_buckets(&self) {
        let now = Utc::now().timestamp_millis();
        for tracker in self.devices.write().await.values_mut() {
            tracker.pending = None;
            tracker.snapshot.first_seen = now;
            tracker.snapshot.sample_count = 0;
        }
    }

    async fn set_status(&self, app: &AppHandle, status: ScanStatus) {
        *self.status.write().await = status.clone();
        let _ = app.emit("ble://status", status);
    }

    async fn emit_snapshot(&self, app: &AppHandle) {
        let _ = app.emit("ble://snapshot", self.snapshots().await);
    }

    async fn process(
        &self,
        input: AdvertisementInput,
        database: &Database,
        settings: &RwLock<AppSettings>,
    ) {
        let app_settings = settings.read().await.clone();
        let calibrations = self.calibrations.read().await.clone();
        let alias = if self.devices.read().await.contains_key(&input.id) {
            None
        } else {
            database.get_alias(&input.id).unwrap_or(None)
        };

        let device_id = input.id.clone();
        let mut devices = self.devices.write().await;
        let completed = if let Some(tracker) = devices.get_mut(&device_id) {
            tracker.observe(input, &app_settings, &calibrations)
        } else {
            devices.insert(
                device_id.clone(),
                DeviceTracker::new(input, alias, &app_settings, &calibrations),
            );
            None
        };
        let snapshot = devices
            .get(&device_id)
            .map(|tracker| tracker.snapshot.clone());
        drop(devices);

        if app_settings.recording_enabled {
            if let (Some(bucket), Some(snapshot)) = (completed, snapshot) {
                let observation = bucket.into_observation(device_id);
                if let Err(error) = database.save_observation(&snapshot, &observation) {
                    eprintln!("failed to save BLE observation: {error:#}");
                }
            }
        }
    }

    async fn flush_due(&self, database: &Database, force: bool) {
        let now = Utc::now().timestamp_millis();
        let mut pending = Vec::new();
        let mut devices = self.devices.write().await;
        for (device_id, tracker) in devices.iter_mut() {
            let due = tracker
                .pending
                .as_ref()
                .map(|bucket| force || now - bucket.bucket_start >= 10_000)
                .unwrap_or(false);
            if due {
                if let Some(bucket) = tracker.pending.take() {
                    pending.push((
                        tracker.snapshot.clone(),
                        bucket.into_observation(device_id.clone()),
                    ));
                }
            }
        }
        drop(devices);
        for (snapshot, bucket) in pending {
            if let Err(error) = database.save_observation(&snapshot, &bucket) {
                eprintln!("failed to flush BLE observation: {error:#}");
            }
        }
    }

    async fn flush_all(&self, database: &Database) {
        self.flush_due(database, true).await;
    }

    async fn run_real(
        self: Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        settings: Arc<RwLock<AppSettings>>,
        mut stop_receiver: oneshot::Receiver<()>,
    ) -> Result<()> {
        let manager = Manager::new()
            .await
            .context("Bluetooth manager unavailable")?;
        let adapters = manager
            .adapters()
            .await
            .context("unable to enumerate Bluetooth adapters")?;
        let adapter = adapters
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("no Bluetooth Low Energy adapter was found"))?;
        let adapter_name = adapter
            .adapter_info()
            .await
            .unwrap_or_else(|_| "Bluetooth adapter".into());
        let mut events = adapter
            .events()
            .await
            .context("unable to subscribe to Bluetooth events")?;
        adapter
            .start_scan(ScanFilter::default())
            .await
            .context("unable to start BLE discovery")?;

        self.set_status(
            &app,
            ScanStatus {
                state: "scanning".into(),
                adapter_name: Some(adapter_name),
                permission: "granted".into(),
                message: Some("Listening for BLE advertisements".into()),
                error_code: None,
                simulated: false,
            },
        )
        .await;

        let mut render_tick = tokio::time::interval(Duration::from_millis(250));
        let mut flush_tick = tokio::time::interval(Duration::from_secs(10));
        let mut compact_tick = tokio::time::interval(Duration::from_secs(60 * 60));

        loop {
            tokio::select! {
                _ = &mut stop_receiver => break,
                _ = render_tick.tick() => self.emit_snapshot(&app).await,
                _ = flush_tick.tick() => self.flush_due(&database, false).await,
                _ = compact_tick.tick() => {
                    if let Err(error) = database.compact_old_buckets(Utc::now().timestamp_millis()) {
                        eprintln!("failed to compact BLE history: {error:#}");
                    }
                }
                event = events.next() => {
                    let Some(event) = event else {
                        return Err(anyhow!("Bluetooth event stream ended unexpectedly"));
                    };
                    let peripheral_id = match event {
                        CentralEvent::DeviceDiscovered(id)
                        | CentralEvent::DeviceUpdated(id)
                        | CentralEvent::ManufacturerDataAdvertisement { id, .. }
                        | CentralEvent::ServiceDataAdvertisement { id, .. }
                        | CentralEvent::ServicesAdvertisement { id, .. } => Some(id),
                        _ => None,
                    };
                    if let Some(peripheral_id) = peripheral_id {
                        let peripheral = adapter
                            .peripheral(&peripheral_id)
                            .await
                            .context("discovered peripheral disappeared")?;
                        if let Some(properties) = peripheral.properties().await? {
                            let Some(rssi) = properties.rssi else {
                                continue;
                            };
                            let input = AdvertisementInput {
                                id: format!("{:?}", peripheral.id()),
                                name: properties.local_name,
                                advertisement_name: properties.advertisement_name,
                                rssi,
                                tx_power: properties.tx_power_level,
                                manufacturer_ids: properties.manufacturer_data.keys().copied().collect(),
                                manufacturer_data: properties.manufacturer_data,
                                service_uuids: properties.services.iter().chain(properties.service_data.keys()).map(ToString::to_string).collect(),
                                service_data: properties.service_data.into_iter().map(|(uuid, data)| (uuid.to_string(), data)).collect(),
                                device_class: properties.class,
                                observed_at: Utc::now().timestamp_millis(),
                            };
                            self.process(input, &database, &settings).await;
                        }
                    }
                }
            }
        }

        let _ = adapter.stop_scan().await;
        Ok(())
    }

    async fn run_simulation(
        self: Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        settings: Arc<RwLock<AppSettings>>,
        mut stop_receiver: oneshot::Receiver<()>,
    ) -> Result<()> {
        self.set_status(
            &app,
            ScanStatus {
                state: "scanning".into(),
                adapter_name: Some("BLE3D simulated adapter".into()),
                permission: "not-required".into(),
                message: Some("Development simulation is active".into()),
                error_code: None,
                simulated: true,
            },
        )
        .await;

        let devices = [
            ("sim-heart-rate", Some("Pulse Band"), -54, Some(-59), 76_u16),
            (
                "sim-headphones",
                Some("Studio Pods"),
                -66,
                Some(-62),
                117_u16,
            ),
            ("sim-beacon", Some("Entry Beacon"), -74, Some(-59), 89_u16),
            ("sim-thermostat", Some("Nest Sensor"), -80, None, 224_u16),
            ("sim-unknown", None, -87, None, 65535_u16),
            ("sim-keyboard", Some("Desk Keys"), -62, Some(-65), 6_u16),
        ];
        let started = std::time::Instant::now();
        let mut tick = tokio::time::interval(Duration::from_millis(420));
        let mut render_tick = tokio::time::interval(Duration::from_millis(250));
        let mut flush_tick = tokio::time::interval(Duration::from_secs(10));

        loop {
            tokio::select! {
                _ = &mut stop_receiver => break,
                _ = render_tick.tick() => self.emit_snapshot(&app).await,
                _ = flush_tick.tick() => self.flush_due(&database, false).await,
                _ = tick.tick() => {
                    let elapsed = started.elapsed().as_secs_f64();
                    for (index, (id, name, base_rssi, tx_power, manufacturer)) in devices.iter().enumerate() {
                        let wave = (elapsed * (0.55 + index as f64 * 0.07) + index as f64).sin();
                        let noise = ((elapsed * 9.0 + index as f64 * 3.1).cos() * 1.8).round() as i16;
                        self.process(
                            AdvertisementInput {
                                id: (*id).into(),
                                name: name.map(str::to_string),
                                advertisement_name: name.map(str::to_string),
                                rssi: *base_rssi + (wave * 5.0).round() as i16 + noise,
                                tx_power: *tx_power,
                                manufacturer_ids: vec![*manufacturer],
                                manufacturer_data: HashMap::from([(*manufacturer, vec![])]),
                                service_uuids: if index == 0 {
                                    vec!["0000180d-0000-1000-8000-00805f9b34fb".into()]
                                } else if index == 2 {
                                    vec!["0000feaa-0000-1000-8000-00805f9b34fb".into()]
                                } else if index == 3 {
                                    vec!["0000181a-0000-1000-8000-00805f9b34fb".into()]
                                } else if index == 5 {
                                    vec!["00001812-0000-1000-8000-00805f9b34fb".into()]
                                } else { vec![] },
                                service_data: HashMap::new(),
                                device_class: None,
                                observed_at: Utc::now().timestamp_millis(),
                            },
                            &database,
                            &settings,
                        ).await;
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    #[tokio::test]
    async fn tracker_becomes_stale_without_changing_its_position_seed() {
        let scanner = ScannerService::new(vec![]);
        let input = AdvertisementInput {
            id: "fixture".into(),
            name: Some("Fixture".into()),
            advertisement_name: None,
            rssi: -60,
            tx_power: Some(-59),
            manufacturer_ids: vec![],
            manufacturer_data: HashMap::new(),
            service_uuids: vec![],
            service_data: HashMap::new(),
            device_class: None,
            observed_at: Utc::now().timestamp_millis() - 11_000,
        };
        scanner.devices.write().await.insert(
            "fixture".into(),
            DeviceTracker::new(input, None, &AppSettings::default(), &[]),
        );
        let snapshots = scanner.snapshots().await;
        assert_eq!(snapshots[0].state, "stale");
        assert_eq!(snapshots[0].position.bearing_kind, "synthetic");
    }

    #[tokio::test]
    async fn trackers_older_than_thirty_seconds_are_removed() {
        let scanner = ScannerService::new(vec![]);
        let input = AdvertisementInput {
            id: "expired".into(),
            name: None,
            advertisement_name: None,
            rssi: -90,
            tx_power: None,
            manufacturer_ids: vec![],
            manufacturer_data: HashMap::new(),
            service_uuids: vec![],
            service_data: HashMap::new(),
            device_class: None,
            observed_at: Utc::now().timestamp_millis() - 31_000,
        };
        scanner.devices.write().await.insert(
            "expired".into(),
            DeviceTracker::new(input, None, &AppSettings::default(), &[]),
        );
        assert!(scanner.snapshots().await.is_empty());
    }

    #[tokio::test]
    async fn simulated_observations_flow_through_ranging_and_history() {
        let scanner = ScannerService::new(vec![]);
        let database = Database::in_memory().unwrap();
        let settings = RwLock::new(AppSettings::default());
        let now = Utc::now().timestamp_millis();

        for index in 0..4 {
            scanner
                .process(
                    AdvertisementInput {
                        id: "simulated-fixture".into(),
                        name: Some("Fixture".into()),
                        advertisement_name: None,
                        rssi: -60 - index,
                        tx_power: Some(-59),
                        manufacturer_ids: vec![76],
                        manufacturer_data: HashMap::from([(76, vec![2, 21])]),
                        service_uuids: vec!["180d".into()],
                        service_data: HashMap::new(),
                        device_class: None,
                        observed_at: now + index as i64 * 10_000,
                    },
                    &database,
                    &settings,
                )
                .await;
        }
        scanner.flush_all(&database).await;

        let snapshots = scanner.snapshots().await;
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].id, "simulated-fixture");
        assert!(snapshots[0].distance_meters > 0.0);
        assert!(database.get_history("simulated-fixture", 10).unwrap().len() >= 3);
    }
}
