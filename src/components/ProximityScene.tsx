import { Html, Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { deviceLabel, layoutDevicePositions } from "../lib/devices";
import { classifyDevice } from "../lib/deviceClassification";
import type { DeviceSnapshot } from "../types";
import { DeviceTypeIcon } from "./DeviceTypeIcon";

interface SceneProps {
  devices: DeviceSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  maxDistance: number;
  markerSize: number;
  cameraCommand: { view: "reset" | "top"; nonce: number };
}

const confidenceColors = { high: "#74f2ce", medium: "#ffca71", low: "#ff7b7b" };

function CameraController({ command, maxDistance }: { command: SceneProps["cameraCommand"]; maxDistance: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const distance = Math.max(12, Math.min(48, maxDistance * 1.25));
    if (command.view === "top") camera.position.set(0, distance, 0.01);
    else camera.position.set(distance * 0.65, distance * 0.46, distance * 0.72);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, command, maxDistance]);
  return null;
}

function HostMarker() {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const scale = 1 + (Math.sin(clock.elapsedTime * 2.3) + 1) * 0.18;
    ring.current.scale.setScalar(scale);
  });
  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[0.34, 2]} />
        <meshStandardMaterial color="#d9ffff" emissive="#43d8ff" emissiveIntensity={2.6} roughness={0.28} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.48, 0.52, 64]} />
        <meshBasicMaterial color="#78f6ff" transparent opacity={0.38} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, -0.78, 0]} center className="scene-label host-label">
        THIS DEVICE · ORIGIN
      </Html>
    </group>
  );
}

function RangeShell({ radius }: { radius: number }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 48, 28]} />
        <meshBasicMaterial color="#76e6ee" wireframe transparent opacity={radius <= 5 ? 0.085 : 0.045} depthWrite={false} />
      </mesh>
      <Html position={[radius, 0, 0]} center className="scene-label shell-label">
        {radius}m
      </Html>
    </group>
  );
}

function DeviceMarker({
  device,
  target,
  selected,
  markerSize,
  onSelect,
}: {
  device: DeviceSnapshot;
  target: [number, number, number];
  selected: boolean;
  markerSize: number;
  onSelect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const targetVector = useMemo(() => new THREE.Vector3(...target), [target]);
  const direction = useMemo(() => targetVector.clone().normalize(), [targetVector]);
  const uncertaintyStart = direction
    .clone()
    .multiplyScalar(Math.max(0.1, device.distanceMeters - device.uncertaintyMeters));
  const uncertaintyEnd = direction
    .clone()
    .multiplyScalar(device.distanceMeters + device.uncertaintyMeters);
  const color = confidenceColors[device.confidence];
  const classification = useMemo(() => classifyDevice(device), [device]);

  useFrame((_, delta) => {
    if (group.current) group.current.position.lerp(targetVector, 1 - Math.exp(-delta * 8));
  });

  return (
    <>
      <Line
        points={[uncertaintyStart, uncertaintyEnd]}
        color={color}
        transparent
        opacity={selected ? 0.72 : 0.28}
        lineWidth={selected ? 2 : 1}
      />
      <group ref={group} position={target}>
        <Html center style={{ pointerEvents: "none" }} zIndexRange={[40, 0]}>
          <div className={`screen-marker-wrap ${device.state} ${selected ? "selected" : ""}`}>
            <button
              type="button"
              className="screen-marker"
              style={{ width: `${markerSize}px`, height: `${markerSize}px`, color }}
              onClick={(event) => { event.stopPropagation(); onSelect(); }}
              onPointerEnter={() => setHovered(true)}
              onPointerLeave={() => setHovered(false)}
              aria-label={`${deviceLabel(device)}, ${classification.typeLabel}, ${device.distanceMeters.toFixed(1)} meters`}
            >
              <DeviceTypeIcon kind={classification.kind} size={Math.max(15, markerSize * 0.48)} />
            </button>
            {(selected || hovered) && (
              <div className="device-marker-label">
                <strong>{deviceLabel(device)}</strong>
                <span>{classification.typeLabel} · {classification.confidence} ID</span>
                <span>{device.distanceMeters.toFixed(1)}m ± {device.uncertaintyMeters.toFixed(1)}m</span>
              </div>
            )}
          </div>
        </Html>
      </group>
    </>
  );
}

function SceneContents(props: SceneProps) {
  const positions = useMemo(() => layoutDevicePositions(props.devices), [props.devices]);
  const shellOptions = [1, 3, 5, 10, 20, 30, 50].filter((radius) => radius <= props.maxDistance);
  return (
    <>
      <PerspectiveCamera makeDefault fov={47} near={0.05} far={250} />
      <CameraController command={props.cameraCommand} maxDistance={props.maxDistance} />
      <color attach="background" args={["#071014"]} />
      <fog attach="fog" args={["#071014", 28, 92]} />
      <ambientLight intensity={0.7} />
      <pointLight position={[0, 0, 0]} intensity={12} color="#70eaff" distance={10} decay={2} />
      <directionalLight position={[12, 18, 10]} intensity={1.2} color="#b7f7ff" />
      {shellOptions.map((radius) => <RangeShell key={radius} radius={radius} />)}
      <Line points={[[-props.maxDistance, 0, 0], [props.maxDistance, 0, 0]]} color="#72d8df" transparent opacity={0.14} />
      <Line points={[[0, -props.maxDistance, 0], [0, props.maxDistance, 0]]} color="#72d8df" transparent opacity={0.14} />
      <Line points={[[0, 0, -props.maxDistance], [0, 0, props.maxDistance]]} color="#72d8df" transparent opacity={0.14} />
      <HostMarker />
      {props.devices.map((device) => (
        <DeviceMarker
          key={device.id}
          device={device}
          target={positions.get(device.id) || [0, 0, 0]}
          selected={props.selectedId === device.id}
          markerSize={props.markerSize}
          onSelect={() => props.onSelect(device.id)}
        />
      ))}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={2.5}
        maxDistance={100}
        enablePan
      />
    </>
  );
}

export function ProximityScene(props: SceneProps) {
  return (
    <div className="scene-wrap" aria-label="Interactive 3D BLE proximity visualization">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <SceneContents {...props} />
      </Canvas>
      <div className="scene-key" aria-hidden="true">
        <span><i className="high" /> high</span><span><i className="medium" /> medium</span><span><i className="low" /> low confidence</span>
      </div>
    </div>
  );
}
