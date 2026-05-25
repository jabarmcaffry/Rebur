import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";

/**
 * Camera rig that follows the player using OrbitControls.
 * Supports third-person chase camera and shift-lock mode.
 */
export default function ChaseCameraRig({
  player,
  shiftLock = false,
  onCameraYawChange,
}: {
  player: RenderPlayer;
  shiftLock?: boolean;
  onCameraYawChange?: (yaw: number) => void;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const lastPlayerPos = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  // Camera configuration
  const distance = 6;
  const minDistance = 2;
  const maxDistance = 20;
  const offset = { x: 0, y: 1.95, z: 0 };
  const fov = 60;

  useFrame(() => {
    const head = new THREE.Vector3(
      player.position.x + offset.x,
      player.position.y + offset.y,
      player.position.z + offset.z,
    );
    const up = new THREE.Vector3(0, 1, 0);

    if (!initialized.current) {
      lastPlayerPos.current.copy(head);
      initialized.current = true;
    }

    if ((camera as any).fov !== fov) {
      (camera as any).fov = fov;
      (camera as any).updateProjectionMatrix?.();
    }

    // Chase camera: translate by player movement delta
    const delta = head.clone().sub(lastPlayerPos.current);
    camera.position.add(delta);
    lastPlayerPos.current.copy(head);

    camera.up.lerp(up, 0.15).normalize();

    if (controlsRef.current) {
      const ctl = controlsRef.current;
      ctl.target.set(head.x, head.y, head.z);
      ctl.minDistance = minDistance;
      ctl.maxDistance = maxDistance;
      ctl.enableRotate = !shiftLock;
      ctl.enabled = true;
      ctl.update();

      // Shift lock: force camera directly behind the player
      if (shiftLock) {
        const yaw = player.rotation.y;
        const targetPos = new THREE.Vector3(
          head.x - Math.sin(yaw) * distance,
          head.y + distance * 0.35,
          head.z - Math.cos(yaw) * distance,
        );
        camera.position.lerp(targetPos, 0.12);
        ctl.update();
      }
    }

    // Report camera yaw back to parent for input handling
    if (onCameraYawChange) {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const yaw = Math.atan2(fwd.x, fwd.z);
      onCameraYawChange(yaw);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.18}
      enablePan={false}
      minDistance={minDistance}
      maxDistance={maxDistance}
    />
  );
}
