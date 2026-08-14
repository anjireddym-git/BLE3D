import { useState } from "react";
import { Database, FlaskConical, Settings2, Trash2, X } from "lucide-react";
import type { AppSettings, CalibrationProfile } from "../types";

interface Props {
  settings: AppSettings;
  calibrations: CalibrationProfile[];
  scanning: boolean;
  onSave: (settings: AppSettings) => Promise<unknown>;
  onDeleteCalibration: (id: number) => Promise<unknown>;
  onClearHistory: () => Promise<unknown>;
  onClose: () => void;
}

export function SettingsModal(props: Props) {
  const [draft, setDraft] = useState(props.settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const patch = (next: Partial<AppSettings>) => setDraft({ ...draft, ...next });
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await props.onSave(draft);
      setMessage("Settings saved");
    } catch (reason) {
      setMessage(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Delete all discovered-device metadata and observation history? Calibration and settings will be preserved.")) return;
    await props.onClearHistory();
    setMessage("History cleared. New observations will continue to be recorded.");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><div><small>BLE3D CONFIGURATION</small><h2 id="settings-title">Settings & data</h2></div><button className="icon-button" onClick={props.onClose} aria-label="Close settings"><X size={18} /></button></header>
        <div className="settings-sections">
          <section>
            <h3><Settings2 size={16} /> Ranging</h3>
            <div className="settings-grid">
              <label><span>Maximum display range</span><input type="number" min="1" max="100" value={draft.maxDistance} onChange={(event) => patch({ maxDistance: Number(event.target.value) })} /><em>meters</em></label>
              <label><span>Fallback RSSI at 1m</span><input type="number" min="-120" max="-20" value={draft.defaultReferenceRssi} onChange={(event) => patch({ defaultReferenceRssi: Number(event.target.value) })} /><em>dBm</em></label>
              <label><span>Fallback path-loss</span><input type="number" min="1.2" max="6" step="0.1" value={draft.defaultPathLossExponent} onChange={(event) => patch({ defaultPathLossExponent: Number(event.target.value) })} /></label>
              <label><span>Map icon size</span><input type="number" min="20" max="72" value={draft.markerSize} onChange={(event) => patch({ markerSize: Number(event.target.value) })} /><em>pixels</em></label>
            </div>
            <label className="toggle-row"><span><strong>Show unnamed devices</strong><small>Include advertisements without a local name</small></span><input type="checkbox" checked={draft.showUnnamed} onChange={(event) => patch({ showUnnamed: event.target.checked })} /></label>
            <label className="toggle-row"><span><strong>Show unidentified signals</strong><small>Keep unclassified advertisements on the map</small></span><input type="checkbox" checked={draft.showUnidentified} onChange={(event) => patch({ showUnidentified: event.target.checked })} /></label>
            <label className="toggle-row"><span><strong>Record local history</strong><small>Store compacted signal summaries in SQLite</small></span><input type="checkbox" checked={draft.recordingEnabled} onChange={(event) => patch({ recordingEnabled: event.target.checked })} /></label>
          </section>

          {import.meta.env.DEV && (
            <section>
              <h3><FlaskConical size={16} /> Development</h3>
              <label className="toggle-row"><span><strong>Simulated scanner</strong><small>{props.scanning ? "Stop scanning before changing source" : "Generate deterministic local BLE fixtures"}</small></span><input type="checkbox" disabled={props.scanning} checked={draft.simulationEnabled} onChange={(event) => patch({ simulationEnabled: event.target.checked })} /></label>
            </section>
          )}

          <section>
            <h3><Database size={16} /> Calibration profiles</h3>
            {props.calibrations.length === 0 ? <p className="muted-copy">No guided calibrations saved yet.</p> : (
              <div className="calibration-list">
                {props.calibrations.map((profile) => (
                  <div key={profile.id}>
                    <span><strong>{profile.scope === "global" ? "Shared environment" : "Device profile"}</strong><small>{profile.referenceRssi.toFixed(1)} dBm · n={profile.pathLossExponent.toFixed(2)}</small></span>
                    <button className="icon-button danger" onClick={() => profile.id != null && void props.onDeleteCalibration(profile.id)} aria-label="Delete calibration"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="danger-zone">
            <h3><Trash2 size={16} /> Local history</h3>
            <p>History is retained until you clear it. Ten-second samples older than 24 hours are compacted into one-minute summaries.</p>
            <button className="danger-button" onClick={() => void clearHistory()}>Clear discovery history</button>
          </section>
        </div>
        <footer>{message ? <p className="settings-message">{message}</p> : <span />}<button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save settings"}</button></footer>
      </section>
    </div>
  );
}
