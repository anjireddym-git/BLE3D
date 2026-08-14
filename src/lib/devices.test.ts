import { describe, expect, it } from "vitest";
import { filterDevices, layoutDevicePositions, sphericalToCartesian } from "./devices";
import type { DeviceFilters, DeviceSnapshot } from "../types";

function fixture(overrides: Partial<DeviceSnapshot> = {}): DeviceSnapshot {
  return {
    id: "fixture-1",
    name: "Desk Beacon",
    advertisementName: null,
    alias: null,
    rssi: -60,
    filteredRssi: -61,
    txPower: -59,
    distanceMeters: 1.3,
    uncertaintyMeters: 0.4,
    confidence: "high",
    calibrationSource: "advertised TX",
    lastSeen: Date.now(),
    firstSeen: Date.now() - 1000,
    state: "active",
    manufacturerIds: [76],
    manufacturerData: {},
    serviceUuids: ["180d"],
    serviceData: {},
    deviceClass: null,
    position: { radius: 1.3, azimuth: 0.2, elevation: 0.1, bearingKind: "synthetic" },
    sampleCount: 10,
    ...overrides,
  };
}

const filters: DeviceFilters = {
  query: "",
  showUnnamed: true,
  showUnidentified: true,
  maxDistance: 30,
  minRssi: -105,
  confidence: "all",
  state: "all",
  manufacturer: "",
  service: "",
};

describe("filterDevices", () => {
  it("combines name, radio, manufacturer, service and state filters", () => {
    const devices = [fixture(), fixture({ id: "quiet", name: null, filteredRssi: -96, confidence: "low" })];
    expect(filterDevices(devices, { ...filters, query: "desk", manufacturer: "76", service: "180" })).toHaveLength(1);
    expect(filterDevices(devices, { ...filters, showUnnamed: false })).toHaveLength(1);
    expect(filterDevices(devices, { ...filters, minRssi: -80 })).toHaveLength(1);
  });
});

describe("device positioning", () => {
  it("preserves the measured radius during spherical conversion", () => {
    const device = fixture();
    const [x, y, z] = sphericalToCartesian(device);
    expect(Math.hypot(x, y, z)).toBeCloseTo(device.distanceMeters, 8);
  });

  it("separates colliding markers tangentially without changing radius", () => {
    const first = fixture({ id: "a" });
    const second = fixture({ id: "b", distanceMeters: 1.35, position: { ...first.position, radius: 1.35 } });
    const positions = layoutDevicePositions([first, second]);
    expect(Math.hypot(...positions.get("a")!)).toBeCloseTo(1.3, 8);
    expect(Math.hypot(...positions.get("b")!)).toBeCloseTo(1.35, 8);
    expect(positions.get("a")).not.toEqual(positions.get("b"));
  });
});
