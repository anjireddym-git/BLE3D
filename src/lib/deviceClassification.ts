import type {
  DeviceKind,
  DeviceSnapshot,
  IdentificationConfidence,
} from "../types";
import { COMPANY_NAMES, SERVICE_NAMES } from "../data/bluetoothAssignedNumbers";

export interface DeviceClassification {
  kind: DeviceKind;
  typeLabel: string;
  vendor: string | null;
  model: string | null;
  confidence: IdentificationConfidence;
  evidence: string[];
  serviceNames: string[];
}

const COMPANY_DISPLAY_NAMES: Record<number, string> = {
  0x0006: "Microsoft", 0x004c: "Apple", 0x0059: "Nordic Semiconductor",
  0x0065: "HP", 0x0075: "Samsung Electronics", 0x0087: "Garmin",
  0x00c4: "LG Electronics", 0x00e0: "Google", 0x018e: "Google",
  0x01dd: "Philips", 0x038f: "Xiaomi", 0x05a7: "Sonos",
  0x060f: "Signify", 0x067c: "Tile",
};
const MEMBER_SERVICE_NAMES: Record<string, string> = {
  feaa: "Eddystone beacon",
  fe2c: "Fast Pair",
};

const TYPE_LABELS: Record<DeviceKind, string> = {
  phone: "Phone", tablet: "Tablet", computer: "Computer", watch: "Watch",
  headphones: "Headphones", speaker: "Speaker", keyboard: "Keyboard", mouse: "Mouse",
  gamepad: "Game controller", health: "Health device", fitness: "Fitness device",
  lighting: "Smart light", sensor: "Sensor", beacon: "Beacon", tracker: "Tracker",
  camera: "Camera", printer: "Printer", network: "Network device", home: "Smart-home device",
  vehicle: "Vehicle", unknown: "Unidentified BLE device",
};

function shortUuid(uuid: string): string {
  const normalized = uuid.toLowerCase().replace(/^0x/, "");
  const base = normalized.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
  return base?.[1] || (/^[0-9a-f]{4}$/.test(normalized) ? normalized : normalized);
}

function serviceSet(device: DeviceSnapshot): Set<string> {
  return new Set([...device.serviceUuids, ...Object.keys(device.serviceData)].map(shortUuid));
}

export function manufacturerName(id: number): string | null {
  return COMPANY_DISPLAY_NAMES[id] || COMPANY_NAMES[id] || null;
}

export function manufacturerLabel(id: number): string {
  const company = manufacturerName(id);
  return company ? `${company} (0x${id.toString(16).padStart(4, "0").toUpperCase()})` : `Company 0x${id.toString(16).padStart(4, "0").toUpperCase()}`;
}

export function serviceName(uuid: string): string | null {
  const normalized = shortUuid(uuid);
  return SERVICE_NAMES[normalized] || MEMBER_SERVICE_NAMES[normalized] || null;
}

export function serviceLabel(uuid: string): string {
  const name = serviceName(uuid);
  return name ? `${name} (${shortUuid(uuid).toUpperCase()})` : uuid;
}

export function classifyDevice(device: DeviceSnapshot): DeviceClassification {
  const advertisedName = device.name || device.advertisementName;
  const normalizedName = advertisedName?.toLowerCase() || "";
  const services = serviceSet(device);
  const evidence: string[] = [];
  const vendors = device.manufacturerIds.map(manufacturerName).filter((name): name is string => Boolean(name));
  const vendor = vendors[0] || null;
  if (vendor) evidence.push(`Manufacturer data format registered to ${vendor}`);

  let kind: DeviceKind = "unknown";
  let score = 0;
  const choose = (next: DeviceKind, nextScore: number, reason: string) => {
    if (nextScore > score) {
      kind = next;
      score = nextScore;
    }
    if (!evidence.includes(reason)) evidence.push(reason);
  };

  const applePayload = device.manufacturerData[String(0x004c)];
  if (applePayload?.[0] === 0x02 && applePayload[1] === 0x15) {
    choose("beacon", 100, "Apple manufacturer payload matches the iBeacon prefix");
  }
  if (services.has("feaa")) choose("beacon", 100, "Advertises the Eddystone service");
  if (services.has("fe2c")) choose("headphones", 78, "Advertises Google Fast Pair");

  const serviceRules: Array<[string[], DeviceKind, number, string]> = [
    [["1808", "1809", "1810", "181b", "181d", "181f", "1822", "183a", "1840"], "health", 92, "Advertises a standard Bluetooth health service"],
    [["180d", "1814", "1816", "1818", "1826", "183e"], "fitness", 92, "Advertises a standard Bluetooth fitness service"],
    [["181a", "183b", "185a"], "sensor", 92, "Advertises a standard Bluetooth sensor service"],
    [["1843", "1844", "1846", "1848", "1849", "184d", "184e", "184f", "1850", "1854", "1855"], "headphones", 88, "Advertises a standard Bluetooth audio service"],
    [["1860"], "vehicle", 92, "Advertises the tire-pressure monitoring service"],
  ];
  for (const [ids, type, ruleScore, reason] of serviceRules) {
    if (ids.some((id) => services.has(id))) choose(type, ruleScore, reason);
  }
  if (services.has("1812") || services.has("185c")) {
    const hidKind: DeviceKind = /mouse|trackpad/.test(normalizedName) ? "mouse"
      : /keyboard|keys/.test(normalizedName) ? "keyboard"
        : /game|controller|pad/.test(normalizedName) ? "gamepad" : "computer";
    choose(hidKind, hidKind === "computer" ? 72 : 94, "Advertises the Human Interface Device service");
  }

  const vendorRules: Array<[string, DeviceKind, number]> = [
    ["Tile", "tracker", 82], ["Sonos", "speaker", 84], ["Signify", "lighting", 84],
    ["Garmin", "fitness", 78],
  ];
  for (const [company, type, ruleScore] of vendorRules) {
    if (vendor === company) choose(type, ruleScore, `${company}'s manufacturer-data format usually indicates a ${TYPE_LABELS[type].toLowerCase()}`);
  }

  const nameRules: Array<[RegExp, DeviceKind, number]> = [
    [/\bipad\b|\btablet\b|galaxy tab/, "tablet", 96],
    [/\biphone\b|\bpixel(?:\s|\d)|galaxy (?:s|a|z|note)\d*|\bphone\b/, "phone", 96],
    [/macbook|\bimac\b|\blaptop\b|\bnotebook\b|\bdesktop\b|\bcomputer\b|\bpc\b/, "computer", 94],
    [/airpods?|earbuds?|headphones?|headset|\bbuds?\b|studio pods/, "headphones", 94],
    [/\bspeaker\b|\bsonos\b|soundbar|homepod|\bjbl\b/, "speaker", 94],
    [/\bkeyboard\b|\bkeys\b/, "keyboard", 94],
    [/\bmouse\b|trackpad/, "mouse", 94],
    [/gamepad|game controller|\bcontroller\b|xbox wireless|dualsense|dualshock/, "gamepad", 94],
    [/apple watch|galaxy watch|pixel watch|\bwatch\b/, "watch", 94],
    [/fitbit|\bgarmin\b|fitness|pulse band|activity band/, "fitness", 90],
    [/airtag|\btile\b|smarttag|\btracker\b/, "tracker", 96],
    [/ibeacon|eddystone|\bbeacon\b/, "beacon", 96],
    [/thermostat|thermometer|hygro|\bsensor\b|weather station/, "sensor", 90],
    [/\bhue\b|govee|\bbulb\b|\blight\b|\blamp\b/, "lighting", 90],
    [/\bcamera\b|\bcam\b|doorbell/, "camera", 90],
    [/\bprinter\b/, "printer", 94],
    [/\brouter\b|\bgateway\b|access point/, "network", 88],
    [/\btesla\b|\bvehicle\b|\bcar\b/, "vehicle", 88],
  ];
  for (const [pattern, type, ruleScore] of nameRules) {
    if (pattern.test(normalizedName)) choose(type, ruleScore, `Advertised name suggests ${TYPE_LABELS[type].toLowerCase()}`);
  }

  if (device.deviceClass != null) {
    const majorClass = (device.deviceClass >> 8) & 0x1f;
    const classKinds: Record<number, DeviceKind> = {
      1: "computer", 2: "phone", 3: "network", 4: "speaker", 5: "computer",
      6: "camera", 7: "watch", 9: "health",
    };
    const classKind = classKinds[majorClass];
    if (classKind) choose(classKind, 86, `Bluetooth device class indicates ${TYPE_LABELS[classKind].toLowerCase()}`);
  }

  const serviceNames = [...services].map(serviceName).filter((name): name is string => Boolean(name));
  const confidence: IdentificationConfidence = score >= 90 ? "identified" : score >= 70 ? "probable" : "limited";
  return {
    kind,
    typeLabel: TYPE_LABELS[kind],
    vendor,
    model: advertisedName || null,
    confidence,
    evidence: evidence.length ? evidence : ["No identifying name, class, or recognized service was advertised"],
    serviceNames,
  };
}
