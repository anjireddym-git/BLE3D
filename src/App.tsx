import { useEffect, useMemo, useState } from "react";
import { Crosshair, Play, RotateCcw, Settings, Square, View } from "lucide-react";
import { CalibrationModal } from "./components/CalibrationModal";
import { DeviceDetails } from "./components/DeviceDetails";
import { DeviceList } from "./components/DeviceList";
import { FilterPanel } from "./components/FilterPanel";
import { Logo } from "./components/Logo";
import { ProximityScene } from "./components/ProximityScene";
import { SettingsModal } from "./components/SettingsModal";
import { StatusPill } from "./components/StatusPill";
import { useBleData } from "./hooks/useBleData";
import { api } from "./lib/api";
import { filterDevices } from "./lib/devices";
import { classifyDevice } from "./lib/deviceClassification";
import type { DeviceFilters } from "./types";

export default function App() {
  const ble = useBleData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<{ view: "reset" | "top"; nonce: number }>({ view: "reset", nonce: 0 });
  const [markerSize, setMarkerSize] = useState(36);
  const [filters, setFilters] = useState<DeviceFilters>({
    query: "",
    showUnnamed: true,
    showUnidentified: false,
    maxDistance: 30,
    minRssi: -105,
    confidence: "all",
    state: "all",
    manufacturer: "",
    service: "",
  });

  useEffect(() => {
    if (ble.ready) {
      setFilters((current) => ({ ...current, showUnnamed: ble.settings.showUnnamed, showUnidentified: ble.settings.showUnidentified, maxDistance: ble.settings.maxDistance }));
      setMarkerSize(ble.settings.markerSize);
    }
  }, [ble.ready, ble.settings.maxDistance, ble.settings.markerSize, ble.settings.showUnidentified, ble.settings.showUnnamed]);

  const visibleDevices = useMemo(() => filterDevices(ble.devices, filters), [ble.devices, filters]);
  const selectedDevice = ble.devices.find((device) => device.id === selectedId) || null;
  const unidentifiedCount = useMemo(() => ble.devices.filter((device) => classifyDevice(device).kind === "unknown").length, [ble.devices]);
  const scanning = ble.status.state === "scanning" || ble.status.state === "starting" || ble.status.state === "stopping";

  const updateAlias = (id: string, alias: string | null) => {
    ble.setDevices((devices) => devices.map((device) => device.id === id ? { ...device, alias } : device));
  };

  const clearHistory = async () => {
    await api.clearHistory();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <Logo />
        <div className="topbar-center">
          <StatusPill status={ble.status} />
          <span className="adapter-name">{ble.status.adapterName || ble.status.message || "Bluetooth adapter not selected"}</span>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings size={18} /></button>
          {scanning ? (
            <button className="scan-button stop" onClick={() => void ble.stop()} disabled={ble.status.state === "stopping"}><Square size={13} fill="currentColor" /> Stop scan</button>
          ) : (
            <button className="scan-button" onClick={() => void ble.start()} disabled={!ble.ready}><Play size={14} fill="currentColor" /> Start scan</button>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <FilterPanel filters={filters} setFilters={setFilters} visibleCount={visibleDevices.length} totalCount={ble.devices.length} unidentifiedCount={unidentifiedCount} />
          <DeviceList devices={visibleDevices} selectedId={selectedId} onSelect={setSelectedId} scanning={ble.status.state === "scanning"} />
        </aside>

        <section className="map-panel">
          <ProximityScene devices={visibleDevices} selectedId={selectedId} onSelect={setSelectedId} maxDistance={filters.maxDistance} markerSize={markerSize} cameraCommand={cameraCommand} />
          <div className="map-readout">
            <small>LIVE PROXIMITY SPACE</small>
            <strong>{visibleDevices.length} <span>devices mapped</span></strong>
            <p><Crosshair size={13} /> origin fixed to this computer</p>
          </div>
          <div className="camera-tools" aria-label="Camera controls">
            <button onClick={() => setCameraCommand({ view: "reset", nonce: Date.now() })} title="Reset camera"><RotateCcw size={16} /></button>
            <button onClick={() => setCameraCommand({ view: "top", nonce: Date.now() })} title="Top view"><View size={17} /></button>
          </div>
          <label className="marker-size-control">
            <span>Icon size</span>
            <input
              aria-label="Device icon size"
              type="range"
              min="20"
              max="72"
              value={markerSize}
              onChange={(event) => setMarkerSize(Number(event.target.value))}
              onPointerUp={() => void ble.updateSettings({ ...ble.settings, markerSize })}
              onKeyUp={() => void ble.updateSettings({ ...ble.settings, markerSize })}
            />
          </label>
          <div className="accuracy-note"><strong>Approximate range only</strong><span>Angles are stable visual placements, not measured bearings.</span></div>
          {ble.error && <div className="error-banner" role="alert"><span>{ble.error}</span><button onClick={() => ble.setError(null)}>Dismiss</button></div>}
        </section>

        {selectedDevice && (
          <DeviceDetails device={selectedDevice} onClose={() => setSelectedId(null)} onCalibrate={() => setCalibrationOpen(true)} onAliasSaved={updateAlias} />
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={ble.settings}
          calibrations={ble.calibrations}
          scanning={scanning}
          onSave={ble.updateSettings}
          onDeleteCalibration={ble.deleteCalibration}
          onClearHistory={clearHistory}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {calibrationOpen && selectedDevice && (
        <CalibrationModal device={selectedDevice} onSave={ble.saveCalibration} onClose={() => setCalibrationOpen(false)} />
      )}
    </main>
  );
}
