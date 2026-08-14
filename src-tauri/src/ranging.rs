use std::collections::VecDeque;

use crate::models::{AppSettings, CalibrationProfile, SyntheticPosition};

const FILTER_WINDOW: usize = 9;
const EMA_ALPHA: f64 = 0.28;

#[derive(Debug, Clone)]
pub struct FilterResult {
    pub filtered_rssi: f64,
    pub standard_deviation: f64,
    pub sample_count: usize,
}

#[derive(Debug, Clone, Default)]
pub struct SignalFilter {
    values: VecDeque<f64>,
    ema: Option<f64>,
}

impl SignalFilter {
    pub fn update(&mut self, rssi: i16) -> FilterResult {
        let rssi = rssi as f64;
        self.values.push_back(rssi);
        while self.values.len() > FILTER_WINDOW {
            self.values.pop_front();
        }

        let mut sorted: Vec<_> = self.values.iter().copied().collect();
        sorted.sort_by(f64::total_cmp);
        let median = sorted[sorted.len() / 2];
        let filtered = match self.ema {
            Some(previous) => previous + EMA_ALPHA * (median - previous),
            None => median,
        };
        self.ema = Some(filtered);

        let mean = self.values.iter().sum::<f64>() / self.values.len() as f64;
        let variance = self
            .values
            .iter()
            .map(|value| (value - mean).powi(2))
            .sum::<f64>()
            / self.values.len() as f64;

        FilterResult {
            filtered_rssi: filtered,
            standard_deviation: variance.sqrt(),
            sample_count: self.values.len(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RangeEstimate {
    pub distance: f64,
    pub uncertainty: f64,
    pub confidence: String,
    pub source: String,
}

pub fn estimate_range(
    device_id: &str,
    filtered_rssi: f64,
    standard_deviation: f64,
    sample_count: usize,
    tx_power: Option<i16>,
    settings: &AppSettings,
    profiles: &[CalibrationProfile],
) -> RangeEstimate {
    let device_profile = profiles.iter().find(|profile| {
        profile.scope == "device" && profile.device_id.as_deref() == Some(device_id)
    });
    let global_profile = profiles.iter().find(|profile| profile.scope == "global");

    let (reference, exponent, source, calibration_penalty) = if let Some(profile) = device_profile {
        (
            profile.reference_rssi,
            profile.path_loss_exponent,
            "device profile".to_string(),
            0.06,
        )
    } else if let Some(power) = tx_power {
        (
            power as f64,
            global_profile
                .map(|profile| profile.path_loss_exponent)
                .unwrap_or(settings.default_path_loss_exponent),
            if global_profile.is_some() {
                "advertised TX + environment".to_string()
            } else {
                "advertised TX".to_string()
            },
            0.16,
        )
    } else if let Some(profile) = global_profile {
        (
            profile.reference_rssi,
            profile.path_loss_exponent,
            "environment profile".to_string(),
            0.22,
        )
    } else {
        (
            settings.default_reference_rssi,
            settings.default_path_loss_exponent,
            "generic fallback".to_string(),
            0.4,
        )
    };

    let exponent = exponent.clamp(1.2, 6.0);
    let raw_distance = 10_f64.powf((reference - filtered_rssi) / (10.0 * exponent));
    let distance = raw_distance.clamp(0.1, settings.max_distance.max(1.0));
    let propagated =
        distance * std::f64::consts::LN_10 / (10.0 * exponent) * standard_deviation.max(2.0);
    let uncertainty =
        (propagated + distance * calibration_penalty).clamp(0.25, settings.max_distance.max(1.0));
    let relative = uncertainty / distance.max(0.1);
    let confidence = if sample_count >= 7 && relative < 0.38 && source != "generic fallback" {
        "high"
    } else if sample_count >= 4 && relative < 0.85 {
        "medium"
    } else {
        "low"
    };

    RangeEstimate {
        distance,
        uncertainty,
        confidence: confidence.to_string(),
        source,
    }
}

pub fn synthetic_position(id: &str, radius: f64) -> SyntheticPosition {
    // FNV-1a gives each opaque platform identifier a stable, inexpensive seed.
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in id.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }

    let upper = (hash >> 32) as u32 as f64 / u32::MAX as f64;
    let lower = hash as u32 as f64 / u32::MAX as f64;
    let azimuth = upper * std::f64::consts::TAU;
    // Uniformly distributed sphere elevation, kept away from the exact poles.
    let z = (lower * 1.8 - 0.9).clamp(-0.9, 0.9);
    let elevation = z.asin();

    SyntheticPosition {
        radius,
        azimuth,
        elevation,
        bearing_kind: "synthetic".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn median_and_ema_reject_a_single_outlier() {
        let mut filter = SignalFilter::default();
        for value in [-60, -61, -60, -20, -62, -61, -60] {
            filter.update(value);
        }
        let result = filter.update(-61);
        assert!(result.filtered_rssi < -58.0);
        assert!(result.filtered_rssi > -64.0);
    }

    #[test]
    fn calibrated_distance_is_monotonic() {
        let settings = AppSettings::default();
        let near = estimate_range("a", -59.0, 1.0, 9, None, &settings, &[]);
        let far = estimate_range("a", -72.0, 1.0, 9, None, &settings, &[]);
        assert!(near.distance < far.distance);
        assert!((near.distance - 1.0).abs() < 0.01);
    }

    #[test]
    fn device_calibration_wins_over_other_sources() {
        let settings = AppSettings::default();
        let profile = CalibrationProfile {
            id: Some(1),
            scope: "device".into(),
            device_id: Some("sensor".into()),
            reference_rssi: -50.0,
            path_loss_exponent: 2.0,
            created_at: 0,
        };
        let result = estimate_range("sensor", -50.0, 1.0, 9, Some(-80), &settings, &[profile]);
        assert_eq!(result.source, "device profile");
        assert!((result.distance - 1.0).abs() < 0.01);
    }

    #[test]
    fn synthetic_bearing_is_stable_and_radius_is_measured_value() {
        let first = synthetic_position("opaque-id", 3.0);
        let second = synthetic_position("opaque-id", 7.0);
        assert_eq!(first.azimuth, second.azimuth);
        assert_eq!(first.elevation, second.elevation);
        assert_eq!(second.radius, 7.0);
        assert_eq!(second.bearing_kind, "synthetic");
    }
}
