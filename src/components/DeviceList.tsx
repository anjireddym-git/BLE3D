import { Bluetooth, ChevronRight } from "lucide-react";
import { deviceLabel, formatDistance, relativeLastSeen } from "../lib/devices";
import { classifyDevice } from "../lib/deviceClassification";
import type { DeviceSnapshot } from "../types";
import { DeviceTypeIcon } from "./DeviceTypeIcon";

interface Props {
  devices: DeviceSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  scanning: boolean;
}

export function DeviceList({ devices, selectedId, onSelect, scanning }: Props) {
  return (
    <section className="device-list" aria-label="Nearby BLE devices">
      <div className="panel-heading"><span>Nearby devices</span><small>radial estimates</small></div>
      {devices.length === 0 ? (
        <div className="empty-list">
          <span className={scanning ? "pulse-icon" : ""}><Bluetooth size={23} /></span>
          <strong>{scanning ? "Listening for advertisements…" : "No live devices"}</strong>
          <p>{scanning ? "Only actively advertising BLE devices can appear." : "Start a scan to map nearby devices."}</p>
        </div>
      ) : (
        <div className="device-scroll">
          {devices.map((device) => {
            const classification = classifyDevice(device);
            return (
            <button
              type="button"
              className={`device-row ${selectedId === device.id ? "selected" : ""} ${device.state}`}
              key={device.id}
              onClick={() => onSelect(device.id)}
              aria-pressed={selectedId === device.id}
            >
              <span className={`device-type-glyph ${classification.confidence}`} aria-label={`${classification.typeLabel}, ${classification.confidence} identification`}><DeviceTypeIcon kind={classification.kind} size={17} /></span>
              <span className="device-row-copy">
                <strong>{deviceLabel(device)}</strong>
                <small>{classification.vendor ? `${classification.vendor} · ` : ""}{classification.typeLabel} · {device.filteredRssi.toFixed(0)} dBm</small>
                <em>{classification.confidence} ID · {relativeLastSeen(device.lastSeen)}</em>
              </span>
              <span className="device-distance">{formatDistance(device.distanceMeters)}<small>±{device.uncertaintyMeters.toFixed(1)}m</small></span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          );})}
        </div>
      )}
    </section>
  );
}
