import {
  Activity, Bluetooth, Camera, Car, Gamepad2, Headphones, HeartPulse, House,
  Keyboard, Laptop, Lightbulb, MapPin, Mouse, Printer, RadioTower, Router,
  Smartphone, Speaker, Tablet, Thermometer, Watch,
} from "lucide-react";
import type { ComponentType } from "react";
import type { DeviceKind } from "../types";

const ICONS: Record<DeviceKind, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  phone: Smartphone, tablet: Tablet, computer: Laptop, watch: Watch,
  headphones: Headphones, speaker: Speaker, keyboard: Keyboard, mouse: Mouse,
  gamepad: Gamepad2, health: HeartPulse, fitness: Activity, lighting: Lightbulb,
  sensor: Thermometer, beacon: RadioTower, tracker: MapPin, camera: Camera,
  printer: Printer, network: Router, home: House, vehicle: Car, unknown: Bluetooth,
};

export function DeviceTypeIcon({ kind, size = 18 }: { kind: DeviceKind; size?: number }) {
  const Icon = ICONS[kind];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
