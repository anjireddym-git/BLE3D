import { useEffect, useState } from "react";
import { Activity, Clock3, Crosshair, Database, Pencil, Radio, X } from "lucide-react";
import { api } from "../lib/api";
import { deviceLabel, formatDistance, relativeLastSeen } from "../lib/devices";
import { classifyDevice, manufacturerLabel, serviceLabel } from "../lib/deviceClassification";
import type { DeviceSnapshot, ObservationBucket } from "../types";
import { HistoryChart } from "./HistoryChart";
import { DeviceTypeIcon } from "./DeviceTypeIcon";

interface Props {
  device: DeviceSnapshot;
  onClose: () => void;
  onCalibrate: () => void;
  onAliasSaved: (id: string, alias: string | null) => void;
}

export function DeviceDetails({ device, onClose, onCalibrate, onAliasSaved }: Props) {
  const classification = classifyDevice(device);
  const [history, setHistory] = useState<ObservationBucket[]>([]);
  const [editingAlias, setEditingAlias] = useState(false);
  const [alias, setAlias] = useState(device.alias || "");
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    setAlias(device.alias || "");
    setHistoryError(null);
    const loadHistory = () => {
      void api.getDeviceHistory(device.id).then(setHistory).catch((reason) => setHistoryError(String(reason)));
    };
    loadHistory();
    const timer = window.setInterval(loadHistory, 10_000);
    return () => window.clearInterval(timer);
  }, [device.id, device.alias]);

  const saveAlias = async () => {
    const normalized = alias.trim() || null;
    await api.setDeviceAlias(device.id, normalized);
    onAliasSaved(device.id, normalized);
    setEditingAlias(false);
  };

  return (
    <aside className="details-panel" aria-label={`Details for ${deviceLabel(device)}`}>
      <div className="details-header">
        <div className={`device-glyph ${classification.confidence}`}><DeviceTypeIcon kind={classification.kind} size={22} /></div>
        <div>
          {editingAlias ? (
            <form onSubmit={(event) => { event.preventDefault(); void saveAlias(); }} className="alias-form">
              <input value={alias} onChange={(event) => setAlias(event.target.value)} maxLength={48} autoFocus aria-label="Device alias" />
              <button type="submit">Save</button>
            </form>
          ) : (
            <h2>{deviceLabel(device)} <button className="icon-button subtle" onClick={() => setEditingAlias(true)} aria-label="Edit alias"><Pencil size={13} /></button></h2>
          )}
          <p>{classification.vendor ? `${classification.vendor} · ` : ""}{classification.typeLabel} · {classification.confidence} identification</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button>
      </div>

      <div className="hero-reading">
        <span>Estimated radial range</span>
        <strong>{formatDistance(device.distanceMeters)}</strong>
        <em>± {device.uncertaintyMeters.toFixed(1)} m uncertainty</em>
      </div>

      <div className="metric-grid">
        <div><Radio /><span>Signal<strong>{device.filteredRssi.toFixed(1)} dBm</strong></span></div>
        <div><Activity /><span>Confidence<strong className={`confidence-text ${device.confidence}`}>{device.confidence}</strong></span></div>
        <div><Clock3 /><span>Last seen<strong>{relativeLastSeen(device.lastSeen)}</strong></span></div>
        <div><Database /><span>Samples<strong>{device.sampleCount.toLocaleString()}</strong></span></div>
      </div>

      <section className="detail-section">
        <div className="section-title"><span>Device identification</span><small>{classification.confidence}</small></div>
        <div className="identification-card">
          <strong>{classification.typeLabel}</strong>
          <span>{classification.model || "No advertised model/name"}</span>
          <ul>{classification.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>

      <section className="detail-section">
        <div className="section-title"><span>Distance history</span><small>{history.length} buckets</small></div>
        {historyError ? <p className="inline-error">{historyError}</p> : <HistoryChart history={history} />}
      </section>

      <section className="detail-section">
        <div className="section-title"><span>Ranging model</span><small>{device.calibrationSource}</small></div>
        <div className="disclosure-card">
          <Crosshair size={17} />
          <p><strong>Direction is illustrative.</strong> Only radial proximity comes from RSSI; the displayed angle is a stable synthetic placement.</p>
        </div>
        <button className="secondary-button full" onClick={onCalibrate}>Calibrate this device</button>
      </section>

      <section className="detail-section metadata-list">
        <div className="section-title"><span>Advertisement</span></div>
        <dl>
          <div><dt>Platform ID</dt><dd title={device.id}>{device.id}</dd></div>
          <div><dt>Local name</dt><dd>{device.name || "Not advertised"}</dd></div>
          <div><dt>Ad name</dt><dd>{device.advertisementName || "Not advertised"}</dd></div>
          <div><dt>Device class</dt><dd>{device.deviceClass == null ? "Not available" : `0x${device.deviceClass.toString(16).toUpperCase()}`}</dd></div>
          <div><dt>Raw RSSI</dt><dd>{device.rssi} dBm</dd></div>
          <div><dt>TX power</dt><dd>{device.txPower == null ? "Not advertised" : `${device.txPower} dBm`}</dd></div>
          <div><dt>Manufacturer</dt><dd title={device.manufacturerIds.map(manufacturerLabel).join(", ")}>{device.manufacturerIds.length ? device.manufacturerIds.map(manufacturerLabel).join(", ") : "Not advertised"}</dd></div>
          <div><dt>Services</dt><dd title={device.serviceUuids.map(serviceLabel).join(", ")}>{device.serviceUuids.length ? device.serviceUuids.map(serviceLabel).join(", ") : "Not advertised"}</dd></div>
        </dl>
      </section>
    </aside>
  );
}
