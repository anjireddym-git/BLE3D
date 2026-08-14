import type { DeviceFilters, DeviceSnapshot } from "../types";
import { classifyDevice, manufacturerLabel, serviceLabel } from "./deviceClassification";

export function deviceLabel(device: DeviceSnapshot): string {
  if (device.alias) return device.alias;
  const classification = classifyDevice(device);
  if (device.name || device.advertisementName) return device.name || device.advertisementName || classification.typeLabel;
  if (classification.kind !== "unknown") {
    return classification.vendor ? `${classification.vendor} ${classification.typeLabel}` : classification.typeLabel;
  }
  return classification.vendor ? `${classification.vendor} BLE signal` : "Unidentified BLE device";
}

export function filterDevices(
  devices: DeviceSnapshot[],
  filters: DeviceFilters,
): DeviceSnapshot[] {
  const query = filters.query.trim().toLowerCase();
  const manufacturer = filters.manufacturer.trim().toLowerCase();
  const service = filters.service.trim().toLowerCase();

  return devices.filter((device) => {
    const classification = classifyDevice(device);
    if (!filters.showUnnamed && !device.alias && !device.name && !device.advertisementName) return false;
    if (!filters.showUnidentified && classification.kind === "unknown") return false;
    if (device.distanceMeters > filters.maxDistance) return false;
    if (device.filteredRssi < filters.minRssi) return false;
    if (filters.confidence !== "all" && device.confidence !== filters.confidence) return false;
    if (filters.state !== "all" && device.state !== filters.state) return false;
    if (
      query &&
      ![deviceLabel(device), device.id, device.name || "", device.advertisementName || "", classification.vendor || "", classification.typeLabel, ...classification.serviceNames]
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    if (
      manufacturer &&
      !device.manufacturerIds.some((id) => `${id} ${manufacturerLabel(id)}`.toLowerCase().includes(manufacturer))
    ) {
      return false;
    }
    if (service && !device.serviceUuids.some((uuid) => serviceLabel(uuid).toLowerCase().includes(service))) {
      return false;
    }
    return true;
  });
}

export function sphericalToCartesian(device: DeviceSnapshot): [number, number, number] {
  const { radius, azimuth, elevation } = device.position;
  const horizontal = radius * Math.cos(elevation);
  return [
    horizontal * Math.cos(azimuth),
    radius * Math.sin(elevation),
    horizontal * Math.sin(azimuth),
  ];
}

export function layoutDevicePositions(
  devices: DeviceSnapshot[],
): Map<string, [number, number, number]> {
  const result = new Map<string, [number, number, number]>();
  const occupied: Array<{ radius: number; azimuth: number; elevation: number }> = [];
  [...devices]
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((device) => {
      const radius = device.position.radius;
      let azimuth = device.position.azimuth;
      let elevation = device.position.elevation;
      let collision = 0;
      for (const previous of occupied) {
        const angularGap =
          Math.abs(previous.azimuth - azimuth) + Math.abs(previous.elevation - elevation);
        if (Math.abs(previous.radius - radius) < 1.25 && angularGap < 0.2) collision += 1;
      }
      if (collision) {
        const direction = collision % 2 === 0 ? 1 : -1;
        azimuth += direction * (0.12 + collision * 0.035);
        elevation = Math.max(-1.15, Math.min(1.15, elevation + direction * 0.06));
      }
      occupied.push({ radius, azimuth, elevation });
      const horizontal = radius * Math.cos(elevation);
      result.set(device.id, [
        horizontal * Math.cos(azimuth),
        radius * Math.sin(elevation),
        horizontal * Math.sin(azimuth),
      ]);
    });
  return result;
}

export function formatDistance(distance: number): string {
  return distance < 1 ? `${Math.round(distance * 100)} cm` : `${distance.toFixed(1)} m`;
}

export function relativeLastSeen(lastSeen: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - lastSeen) / 1000));
  if (seconds < 2) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
