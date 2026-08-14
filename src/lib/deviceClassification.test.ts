import { describe, expect, it } from "vitest";
import type { DeviceSnapshot } from "../types";
import { classifyDevice, manufacturerLabel, serviceLabel } from "./deviceClassification";

function fixture(overrides: Partial<DeviceSnapshot> = {}): DeviceSnapshot {
  return {
    id: "classification-fixture", name: null, advertisementName: null, alias: null,
    rssi: -60, filteredRssi: -61, txPower: -59, distanceMeters: 1.2,
    uncertaintyMeters: 0.4, confidence: "medium", calibrationSource: "advertised TX",
    lastSeen: Date.now(), firstSeen: Date.now(), state: "active", manufacturerIds: [],
    manufacturerData: {}, serviceUuids: [], serviceData: {}, deviceClass: null,
    position: { radius: 1.2, azimuth: 0, elevation: 0, bearingKind: "synthetic" }, sampleCount: 8,
    ...overrides,
  };
}

describe("device classification", () => {
  it("uses explicit names without claiming a manufacturer ID is a model", () => {
    const result = classifyDevice(fixture({ name: "Jane's iPhone", manufacturerIds: [0x004c] }));
    expect(result.kind).toBe("phone");
    expect(result.vendor).toBe("Apple");
    expect(result.confidence).toBe("identified");
  });

  it("recognizes standard service UUIDs in short and full forms", () => {
    expect(classifyDevice(fixture({ serviceUuids: ["0000181a-0000-1000-8000-00805f9b34fb"] })).kind).toBe("sensor");
    expect(classifyDevice(fixture({ serviceUuids: ["1812"], name: "Desk Keys" })).kind).toBe("keyboard");
  });

  it("recognizes an iBeacon manufacturer payload", () => {
    const result = classifyDevice(fixture({ manufacturerIds: [0x004c], manufacturerData: { "76": [0x02, 0x15, 0, 1] } }));
    expect(result.kind).toBe("beacon");
    expect(result.evidence.join(" ")).toContain("iBeacon");
  });

  it("leaves evidence-poor advertisements unidentified", () => {
    const result = classifyDevice(fixture());
    expect(result.kind).toBe("unknown");
    expect(result.confidence).toBe("limited");
  });

  it("renders assigned-number labels", () => {
    expect(manufacturerLabel(0x004c)).toContain("Apple");
    expect(serviceLabel("180d")).toContain("Heart Rate");
  });
});
