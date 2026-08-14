import { Radio, RadioTower, TriangleAlert } from "lucide-react";
import type { ScanStatus } from "../types";

export function StatusPill({ status }: { status: ScanStatus }) {
  const Icon = status.state === "error" ? TriangleAlert : status.state === "scanning" ? RadioTower : Radio;
  const label = status.state === "scanning" && status.simulated ? "Simulating" : status.state;
  return (
    <div className={`status-pill status-${status.state}`} title={status.message || undefined}>
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
