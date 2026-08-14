import { useEffect, useRef, useState } from "react";
import { Check, Ruler, X } from "lucide-react";
import { deviceLabel } from "../lib/devices";
import type { CalibrationProfile, DeviceSnapshot } from "../types";

interface Props {
  device: DeviceSnapshot;
  onClose: () => void;
  onSave: (profile: CalibrationProfile) => Promise<unknown>;
}

type CapturePoint = "one" | "three";

export function CalibrationModal({ device, onClose, onSave }: Props) {
  const latestRssi = useRef(device.filteredRssi);
  const captureTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [capture, setCapture] = useState<{ point: CapturePoint; progress: number } | null>(null);
  const [oneMeterRssi, setOneMeterRssi] = useState<number | null>(null);
  const [threeMeterRssi, setThreeMeterRssi] = useState<number | null>(null);
  const [scope, setScope] = useState<"device" | "global">("device");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { latestRssi.current = device.filteredRssi; }, [device.filteredRssi]);
  useEffect(() => () => {
    if (captureTimer.current) clearInterval(captureTimer.current);
  }, []);

  const beginCapture = (point: CapturePoint) => {
    if (captureTimer.current) clearInterval(captureTimer.current);
    const samples: number[] = [];
    const started = Date.now();
    setCapture({ point, progress: 0 });
    setError(null);
    captureTimer.current = setInterval(() => {
      samples.push(latestRssi.current);
      const progress = Math.min(1, (Date.now() - started) / 8_000);
      setCapture({ point, progress });
      if (progress >= 1) {
        if (captureTimer.current) clearInterval(captureTimer.current);
        captureTimer.current = null;
        const sorted = samples.sort((left, right) => left - right);
        const trim = Math.floor(sorted.length * 0.12);
        const trimmed = sorted.slice(trim, Math.max(trim + 1, sorted.length - trim));
        const average = trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
        if (point === "one") setOneMeterRssi(average);
        else setThreeMeterRssi(average);
        setCapture(null);
      }
    }, 250);
  };

  const exponent = oneMeterRssi != null && threeMeterRssi != null
    ? Math.max(1.2, Math.min(6, (oneMeterRssi - threeMeterRssi) / (10 * Math.log10(3))))
    : null;

  const save = async () => {
    if (oneMeterRssi == null || exponent == null) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: null,
        scope,
        deviceId: scope === "device" ? device.id : null,
        referenceRssi: oneMeterRssi,
        pathLossExponent: exponent,
        createdAt: Date.now(),
      });
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal calibration-modal" role="dialog" aria-modal="true" aria-labelledby="calibration-title">
        <header>
          <div><small>GUIDED TWO-POINT SETUP</small><h2 id="calibration-title">Calibrate {deviceLabel(device)}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close calibration"><X size={18} /></button>
        </header>
        <div className="calibration-intro">
          <Ruler size={22} />
          <p>Use a measuring tape and keep the computer and advertiser still. Each point collects eight seconds of filtered signal data.</p>
        </div>
        <div className="capture-grid">
          {(["one", "three"] as const).map((point) => {
            const value = point === "one" ? oneMeterRssi : threeMeterRssi;
            const active = capture?.point === point;
            return (
              <article className={value != null ? "complete" : ""} key={point}>
                <span className="step-number">{point === "one" ? "01" : "02"}</span>
                <h3>{point === "one" ? "1 meter" : "3 meters"}</h3>
                <p>Place the advertising device exactly {point === "one" ? "one meter" : "three meters"} from this computer.</p>
                {active ? (
                  <div className="capture-progress"><span style={{ width: `${capture.progress * 100}%` }} /><em>{Math.ceil(8 * (1 - capture.progress))}s</em></div>
                ) : (
                  <button className="secondary-button" disabled={capture != null} onClick={() => beginCapture(point)}>
                    {value == null ? "Capture signal" : "Capture again"}
                  </button>
                )}
                {value != null && <strong className="captured-value"><Check size={14} /> {value.toFixed(1)} dBm</strong>}
              </article>
            );
          })}
        </div>
        <div className="calibration-result">
          <div><span>Reference at 1m</span><strong>{oneMeterRssi == null ? "—" : `${oneMeterRssi.toFixed(1)} dBm`}</strong></div>
          <div><span>Path-loss exponent</span><strong>{exponent == null ? "—" : exponent.toFixed(2)}</strong></div>
          <label><span>Apply calibration to</span><select value={scope} onChange={(event) => setScope(event.target.value as "device" | "global")}><option value="device">This device only</option><option value="global">Shared environment</option></select></label>
        </div>
        {error && <p className="inline-error">{error}</p>}
        <footer>
          <p>RSSI remains sensitive to walls, people, antenna orientation, and transmitter differences.</p>
          <button className="primary-button" disabled={exponent == null || saving || capture != null} onClick={() => void save()}>{saving ? "Saving…" : "Save calibration"}</button>
        </footer>
      </section>
    </div>
  );
}
