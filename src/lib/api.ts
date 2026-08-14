import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  CalibrationProfile,
  DeviceSnapshot,
  ObservationBucket,
  ScanStatus,
} from "../types";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error("Open BLE3D through the Tauri desktop application to use Bluetooth.");
  }
  return invoke<T>(name, args);
}

export const api = {
  startScan: () => command<ScanStatus>("start_scan"),
  stopScan: () => command<ScanStatus>("stop_scan"),
  getScanStatus: () => command<ScanStatus>("get_scan_status"),
  getDevices: () => command<DeviceSnapshot[]>("get_devices"),
  getDeviceHistory: (deviceId: string, limit = 360) =>
    command<ObservationBucket[]>("get_device_history", { deviceId, limit }),
  getSettings: () => command<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    command<AppSettings>("update_settings", { settings }),
  getCalibrations: () => command<CalibrationProfile[]>("get_calibrations"),
  saveCalibration: (profile: CalibrationProfile) =>
    command<CalibrationProfile>("save_calibration", { profile }),
  deleteCalibration: (id: number) => command<void>("delete_calibration", { id }),
  clearHistory: () => command<void>("clear_history"),
  setDeviceAlias: (deviceId: string, alias: string | null) =>
    command<void>("set_device_alias", { deviceId, alias }),
  onSnapshot: (callback: (devices: DeviceSnapshot[]) => void): Promise<UnlistenFn> =>
    listen<DeviceSnapshot[]>("ble://snapshot", (event) => callback(event.payload)),
  onStatus: (callback: (status: ScanStatus) => void): Promise<UnlistenFn> =>
    listen<ScanStatus>("ble://status", (event) => callback(event.payload)),
};
