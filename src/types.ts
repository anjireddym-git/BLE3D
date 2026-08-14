export type Confidence = "low" | "medium" | "high";
export type DeviceState = "active" | "stale";
export type DeviceKind =
  | "phone" | "tablet" | "computer" | "watch" | "headphones" | "speaker"
  | "keyboard" | "mouse" | "gamepad" | "health" | "fitness" | "lighting"
  | "sensor" | "beacon" | "tracker" | "camera" | "printer" | "network"
  | "home" | "vehicle" | "unknown";
export type IdentificationConfidence = "identified" | "probable" | "limited";

export interface SyntheticPosition {
  radius: number;
  azimuth: number;
  elevation: number;
  bearingKind: "synthetic";
}

export interface DeviceSnapshot {
  id: string;
  name: string | null;
  advertisementName: string | null;
  alias: string | null;
  rssi: number;
  filteredRssi: number;
  txPower: number | null;
  distanceMeters: number;
  uncertaintyMeters: number;
  confidence: Confidence;
  calibrationSource: string;
  lastSeen: number;
  firstSeen: number;
  state: DeviceState;
  manufacturerIds: number[];
  manufacturerData: Record<string, number[]>;
  serviceUuids: string[];
  serviceData: Record<string, number[]>;
  deviceClass: number | null;
  position: SyntheticPosition;
  sampleCount: number;
}

export interface ObservationBucket {
  deviceId: string;
  bucketStart: number;
  bucketSeconds: number;
  minRssi: number;
  maxRssi: number;
  avgRssi: number;
  avgDistance: number;
  sampleCount: number;
}

export interface CalibrationProfile {
  id: number | null;
  scope: "global" | "device";
  deviceId: string | null;
  referenceRssi: number;
  pathLossExponent: number;
  createdAt: number;
}

export interface ScanStatus {
  state: "stopped" | "starting" | "scanning" | "stopping" | "error";
  adapterName: string | null;
  permission: "unknown" | "granted" | "denied" | "not-required";
  message: string | null;
  errorCode: string | null;
  simulated: boolean;
}

export interface AppSettings {
  simulationEnabled: boolean;
  maxDistance: number;
  defaultReferenceRssi: number;
  defaultPathLossExponent: number;
  showUnnamed: boolean;
  showUnidentified: boolean;
  markerSize: number;
  recordingEnabled: boolean;
}

export interface DeviceFilters {
  query: string;
  showUnnamed: boolean;
  showUnidentified: boolean;
  maxDistance: number;
  minRssi: number;
  confidence: "all" | Confidence;
  state: "all" | DeviceState;
  manufacturer: string;
  service: string;
}
