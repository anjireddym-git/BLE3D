import { useCallback, useEffect, useMemo, useState } from "react";
import { api, isTauri } from "../lib/api";
import type {
  AppSettings,
  CalibrationProfile,
  DeviceSnapshot,
  ScanStatus,
} from "../types";

const defaultStatus: ScanStatus = {
  state: "stopped",
  adapterName: null,
  permission: "unknown",
  message: "Ready to scan",
  errorCode: null,
  simulated: false,
};

const defaultSettings: AppSettings = {
  simulationEnabled: false,
  maxDistance: 30,
  defaultReferenceRssi: -59,
  defaultPathLossExponent: 2.2,
  showUnnamed: true,
  showUnidentified: false,
  markerSize: 36,
  recordingEnabled: true,
};

export function useBleData() {
  const [devices, setDevices] = useState<DeviceSnapshot[]>([]);
  const [status, setStatus] = useState<ScanStatus>(defaultStatus);
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const [calibrations, setCalibrations] = useState<CalibrationProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refreshCalibrations = useCallback(async () => {
    const profiles = await api.getCalibrations();
    setCalibrations(profiles);
    return profiles;
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setError("BLE access requires the Tauri desktop window. Run npm run tauri dev.");
      setReady(true);
      return;
    }
    let disposed = false;
    const cleanups: Array<() => void> = [];
    void (async () => {
      try {
        const [initialStatus, initialDevices, initialSettings, profiles] = await Promise.all([
          api.getScanStatus(),
          api.getDevices(),
          api.getSettings(),
          api.getCalibrations(),
        ]);
        if (disposed) return;
        setStatus(initialStatus);
        setDevices(initialDevices);
        setSettingsState(initialSettings);
        setCalibrations(profiles);
        cleanups.push(await api.onSnapshot(setDevices));
        cleanups.push(await api.onStatus(setStatus));
      } catch (reason) {
        if (!disposed) setError(String(reason));
      } finally {
        if (!disposed) setReady(true);
      }
    })();
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api.startScan());
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api.stopScan());
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const updateSettings = useCallback(async (next: AppSettings) => {
    const saved = await api.updateSettings(next);
    setSettingsState(saved);
    return saved;
  }, []);

  const saveCalibration = useCallback(
    async (profile: CalibrationProfile) => {
      await api.saveCalibration(profile);
      return refreshCalibrations();
    },
    [refreshCalibrations],
  );

  const deleteCalibration = useCallback(
    async (id: number) => {
      await api.deleteCalibration(id);
      return refreshCalibrations();
    },
    [refreshCalibrations],
  );

  const value = useMemo(
    () => ({
      devices,
      status,
      settings,
      calibrations,
      error,
      ready,
      setError,
      start,
      stop,
      updateSettings,
      saveCalibration,
      deleteCalibration,
      setDevices,
    }),
    [
      devices,
      status,
      settings,
      calibrations,
      error,
      ready,
      start,
      stop,
      updateSettings,
      saveCalibration,
      deleteCalibration,
    ],
  );
  return value;
}
