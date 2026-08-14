use std::{path::Path, sync::Mutex};

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{AppSettings, CalibrationProfile, DeviceSnapshot, ObservationBucket};

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)
            .with_context(|| format!("failed to open database at {}", path.display()))?;
        let database = Self {
            connection: Mutex::new(connection),
        };
        database.migrate()?;
        Ok(database)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        let database = Self {
            connection: Mutex::new(Connection::open_in_memory()?),
        };
        database.migrate()?;
        Ok(database)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| anyhow!("database mutex was poisoned"))
    }

    fn migrate(&self) -> Result<()> {
        let connection = self.lock()?;
        connection.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS devices (
               id TEXT PRIMARY KEY,
               name TEXT,
               alias TEXT,
               first_seen INTEGER NOT NULL,
               last_seen INTEGER NOT NULL,
               manufacturer_ids TEXT NOT NULL DEFAULT '[]',
               service_uuids TEXT NOT NULL DEFAULT '[]'
             );
             CREATE TABLE IF NOT EXISTS observation_buckets (
               device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
               bucket_start INTEGER NOT NULL,
               bucket_seconds INTEGER NOT NULL,
               min_rssi REAL NOT NULL,
               max_rssi REAL NOT NULL,
               avg_rssi REAL NOT NULL,
               avg_distance REAL NOT NULL,
               sample_count INTEGER NOT NULL,
               PRIMARY KEY(device_id, bucket_start, bucket_seconds)
             );
             CREATE INDEX IF NOT EXISTS idx_observations_device_time
               ON observation_buckets(device_id, bucket_start);
             CREATE TABLE IF NOT EXISTS calibration_profiles (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               scope TEXT NOT NULL CHECK(scope IN ('global', 'device')),
               device_id TEXT,
               reference_rssi REAL NOT NULL,
               path_loss_exponent REAL NOT NULL,
               created_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS app_settings (
               id INTEGER PRIMARY KEY CHECK(id = 1),
               json TEXT NOT NULL
             );",
        )?;
        Ok(())
    }

    pub fn load_settings(&self) -> Result<AppSettings> {
        let connection = self.lock()?;
        let json: Option<String> = connection
            .query_row("SELECT json FROM app_settings WHERE id = 1", [], |row| {
                row.get(0)
            })
            .optional()?;
        match json {
            Some(value) => Ok(serde_json::from_str(&value).unwrap_or_default()),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let json = serde_json::to_string(settings)?;
        self.lock()?.execute(
            "INSERT INTO app_settings(id, json) VALUES(1, ?1)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json",
            params![json],
        )?;
        Ok(())
    }

    pub fn save_observation(
        &self,
        device: &DeviceSnapshot,
        bucket: &ObservationBucket,
    ) -> Result<()> {
        let manufacturer_ids = serde_json::to_string(&device.manufacturer_ids)?;
        let service_uuids = serde_json::to_string(&device.service_uuids)?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT INTO devices(id, name, alias, first_seen, last_seen, manufacturer_ids, service_uuids)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
               name = COALESCE(excluded.name, devices.name),
               alias = COALESCE(excluded.alias, devices.alias),
               last_seen = MAX(devices.last_seen, excluded.last_seen),
               manufacturer_ids = excluded.manufacturer_ids,
               service_uuids = excluded.service_uuids",
            params![
                device.id,
                device.name,
                device.alias,
                device.first_seen,
                device.last_seen,
                manufacturer_ids,
                service_uuids,
            ],
        )?;
        transaction.execute(
            "INSERT INTO observation_buckets(
               device_id, bucket_start, bucket_seconds, min_rssi, max_rssi,
               avg_rssi, avg_distance, sample_count
             ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(device_id, bucket_start, bucket_seconds) DO UPDATE SET
               min_rssi = MIN(observation_buckets.min_rssi, excluded.min_rssi),
               max_rssi = MAX(observation_buckets.max_rssi, excluded.max_rssi),
               avg_rssi = (
                 observation_buckets.avg_rssi * observation_buckets.sample_count +
                 excluded.avg_rssi * excluded.sample_count
               ) / (observation_buckets.sample_count + excluded.sample_count),
               avg_distance = (
                 observation_buckets.avg_distance * observation_buckets.sample_count +
                 excluded.avg_distance * excluded.sample_count
               ) / (observation_buckets.sample_count + excluded.sample_count),
               sample_count = observation_buckets.sample_count + excluded.sample_count",
            params![
                bucket.device_id,
                bucket.bucket_start,
                bucket.bucket_seconds,
                bucket.min_rssi,
                bucket.max_rssi,
                bucket.avg_rssi,
                bucket.avg_distance,
                bucket.sample_count,
            ],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn get_history(&self, device_id: &str, limit: usize) -> Result<Vec<ObservationBucket>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT device_id, bucket_start, bucket_seconds, min_rssi, max_rssi,
                    avg_rssi, avg_distance, sample_count
             FROM observation_buckets
             WHERE device_id = ?1
             ORDER BY bucket_start DESC
             LIMIT ?2",
        )?;
        let rows = statement.query_map(params![device_id, limit as i64], |row| {
            Ok(ObservationBucket {
                device_id: row.get(0)?,
                bucket_start: row.get(1)?,
                bucket_seconds: row.get(2)?,
                min_rssi: row.get(3)?,
                max_rssi: row.get(4)?,
                avg_rssi: row.get(5)?,
                avg_distance: row.get(6)?,
                sample_count: row.get(7)?,
            })
        })?;
        let mut result: Vec<_> = rows.collect::<rusqlite::Result<_>>()?;
        result.reverse();
        Ok(result)
    }

    pub fn clear_history(&self) -> Result<()> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        transaction.execute("DELETE FROM observation_buckets", [])?;
        transaction.execute("DELETE FROM devices", [])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn get_alias(&self, device_id: &str) -> Result<Option<String>> {
        Ok(self
            .lock()?
            .query_row(
                "SELECT alias FROM devices WHERE id = ?1",
                params![device_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten())
    }

    pub fn set_alias(&self, device_id: &str, alias: Option<&str>) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        self.lock()?.execute(
            "INSERT INTO devices(
               id, name, alias, first_seen, last_seen, manufacturer_ids, service_uuids
             ) VALUES(?1, NULL, ?2, ?3, ?3, '[]', '[]')
             ON CONFLICT(id) DO UPDATE SET alias = excluded.alias",
            params![device_id, alias, now],
        )?;
        Ok(())
    }

    pub fn load_calibrations(&self) -> Result<Vec<CalibrationProfile>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, scope, device_id, reference_rssi, path_loss_exponent, created_at
             FROM calibration_profiles ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(CalibrationProfile {
                id: row.get(0)?,
                scope: row.get(1)?,
                device_id: row.get(2)?,
                reference_rssi: row.get(3)?,
                path_loss_exponent: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn save_calibration(&self, profile: &CalibrationProfile) -> Result<CalibrationProfile> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        if profile.scope == "global" {
            transaction.execute(
                "DELETE FROM calibration_profiles WHERE scope = 'global'",
                [],
            )?;
        } else if let Some(device_id) = &profile.device_id {
            transaction.execute(
                "DELETE FROM calibration_profiles WHERE scope = 'device' AND device_id = ?1",
                params![device_id],
            )?;
        }
        transaction.execute(
            "INSERT INTO calibration_profiles(
               scope, device_id, reference_rssi, path_loss_exponent, created_at
             ) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![
                profile.scope,
                profile.device_id,
                profile.reference_rssi,
                profile.path_loss_exponent,
                profile.created_at,
            ],
        )?;
        let id = transaction.last_insert_rowid();
        transaction.commit()?;
        let mut saved = profile.clone();
        saved.id = Some(id);
        Ok(saved)
    }

    pub fn delete_calibration(&self, id: i64) -> Result<()> {
        self.lock()?.execute(
            "DELETE FROM calibration_profiles WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn compact_old_buckets(&self, now_ms: i64) -> Result<usize> {
        let cutoff = now_ms - 24 * 60 * 60 * 1000;
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let inserted = transaction.execute(
            "INSERT INTO observation_buckets(
               device_id, bucket_start, bucket_seconds, min_rssi, max_rssi,
               avg_rssi, avg_distance, sample_count
             )
             SELECT device_id, (bucket_start / 60000) * 60000, 60,
                    MIN(min_rssi), MAX(max_rssi),
                    SUM(avg_rssi * sample_count) / SUM(sample_count),
                    SUM(avg_distance * sample_count) / SUM(sample_count),
                    SUM(sample_count)
             FROM observation_buckets
             WHERE bucket_seconds = 10 AND bucket_start < ?1
             GROUP BY device_id, (bucket_start / 60000) * 60000
             ON CONFLICT(device_id, bucket_start, bucket_seconds) DO UPDATE SET
               min_rssi = MIN(observation_buckets.min_rssi, excluded.min_rssi),
               max_rssi = MAX(observation_buckets.max_rssi, excluded.max_rssi),
               avg_rssi = (
                 observation_buckets.avg_rssi * observation_buckets.sample_count +
                 excluded.avg_rssi * excluded.sample_count
               ) / (observation_buckets.sample_count + excluded.sample_count),
               avg_distance = (
                 observation_buckets.avg_distance * observation_buckets.sample_count +
                 excluded.avg_distance * excluded.sample_count
               ) / (observation_buckets.sample_count + excluded.sample_count),
               sample_count = observation_buckets.sample_count + excluded.sample_count",
            params![cutoff],
        )?;
        transaction.execute(
            "DELETE FROM observation_buckets WHERE bucket_seconds = 10 AND bucket_start < ?1",
            params![cutoff],
        )?;
        transaction.commit()?;
        Ok(inserted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ranging::synthetic_position;
    use std::collections::HashMap;

    fn device(id: &str, at: i64) -> DeviceSnapshot {
        DeviceSnapshot {
            id: id.into(),
            name: Some("Beacon".into()),
            advertisement_name: None,
            alias: None,
            rssi: -60,
            filtered_rssi: -60.0,
            tx_power: Some(-59),
            distance_meters: 1.2,
            uncertainty_meters: 0.4,
            confidence: "medium".into(),
            calibration_source: "advertised TX".into(),
            last_seen: at,
            first_seen: at,
            state: "active".into(),
            manufacturer_ids: vec![76],
            manufacturer_data: HashMap::new(),
            service_uuids: vec![],
            service_data: HashMap::new(),
            device_class: None,
            position: synthetic_position(id, 1.2),
            sample_count: 5,
        }
    }

    fn bucket(id: &str, at: i64) -> ObservationBucket {
        ObservationBucket {
            device_id: id.into(),
            bucket_start: at,
            bucket_seconds: 10,
            min_rssi: -62.0,
            max_rssi: -58.0,
            avg_rssi: -60.0,
            avg_distance: 1.2,
            sample_count: 5,
        }
    }

    #[test]
    fn history_persists_and_clear_preserves_settings() {
        let database = Database::in_memory().unwrap();
        let settings = AppSettings {
            max_distance: 42.0,
            ..AppSettings::default()
        };
        database.save_settings(&settings).unwrap();
        database
            .save_observation(&device("one", 10_000), &bucket("one", 10_000))
            .unwrap();
        assert_eq!(database.get_history("one", 10).unwrap().len(), 1);
        database.clear_history().unwrap();
        assert!(database.get_history("one", 10).unwrap().is_empty());
        assert_eq!(database.load_settings().unwrap().max_distance, 42.0);
    }

    #[test]
    fn old_raw_buckets_are_compacted_to_minute_buckets() {
        let database = Database::in_memory().unwrap();
        database
            .save_observation(&device("one", 0), &bucket("one", 0))
            .unwrap();
        let mut second = bucket("one", 10_000);
        second.avg_rssi = -70.0;
        database
            .save_observation(&device("one", 10_000), &second)
            .unwrap();
        database.compact_old_buckets(25 * 60 * 60 * 1000).unwrap();
        let history = database.get_history("one", 10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].bucket_seconds, 60);
        assert_eq!(history[0].sample_count, 10);
        assert_eq!(history[0].avg_rssi, -65.0);
    }

    #[test]
    fn calibration_is_replaced_per_scope() {
        let database = Database::in_memory().unwrap();
        for reference in [-59.0, -55.0] {
            database
                .save_calibration(&CalibrationProfile {
                    id: None,
                    scope: "global".into(),
                    device_id: None,
                    reference_rssi: reference,
                    path_loss_exponent: 2.0,
                    created_at: reference.abs() as i64,
                })
                .unwrap();
        }
        let profiles = database.load_calibrations().unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].reference_rssi, -55.0);
    }
}
