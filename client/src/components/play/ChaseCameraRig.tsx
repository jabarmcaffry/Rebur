import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { RenderPlayer, RenderState } from "@shared/render-types";

/**
 * Camera rig that follows the player using OrbitControls.
 * Supports third-person chase camera, shift-lock mode, and
 * server-driven camera settings from Rebur.Camera.
 * Also reports world-space camera position + forward direction
 * back to the parent so they can be sent to the server for
 * Rebur.Camera.getForwardRay() and screenPointToRay().
 */
export default function ChaseCameraRig({
  player,
  shiftLock = false,
  serverCamera,
  onCameraYawChange,
  onCameraStateChange,
}: {
  player: RenderPlayer;
  shiftLock?: boolean;
  serverCamera?: RenderState["camera"];
  onCameraYawChange?: (yaw: number) => void;
  onCameraStateChange?: (
    pos: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number }
  ) => void;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const lastPlayerPos = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  // Default camera configuration (overridden by serverCamera when set)
  const defaultDistance = 6;
  const minDistance = 2;
  const maxDistance = 20;
  const offset = { x: 0, y: 1.95, z: 0 };
  const defaultFov = 60;

  const _fwd = useRef(new THREE.Vector3());

  useFrame(() => {
    const mode = serverCamera?.mode ?? "thirdPerson";
    const fov = serverCamera?.fov ?? defaultFov;

    if ((camera as any).fov !== fov) {
      (camera as any).fov = fov;
      (camera as any).updateProjectionMatrix?.();
    }

    // "fixed" or "scripted" mode: camera positioned directly by script
    if ((mode === "fixed" || mode === "scripted") && serverCamera?.position) {
      const pos = serverCamera.position;
      camera.position.set(pos.x, pos.y, pos.z);
      if (serverCamera.lookAt) {
        camera.lookAt(serverCamera.lookAt.x, serverCamera.lookAt.y, serverCamera.lookAt.z);
      }
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
      _reportCameraState();
      return;
    }

    // "firstPerson" mode
    if (mode === "firstPerson") {
      const head = new THREE.Vector3(
        player.position.x + offset.x,
        player.position.y + offset.y + 0.3,
        player.position.z + offset.z,
      );
      camera.position.copy(head);
      if (controlsRef.current) {
        controlsRef.current.target.set(head.x, head.y, head.z);
        controlsRef.current.minDistance = 0;
        controlsRef.current.maxDistance = 0;
        controlsRef.current.enabled = true;
        controlsRef.current.update();
      }
      if (onCameraYawChange) {
        const fwdV = new THREE.Vector3();
        camera.getWorldDirection(fwdV);
        onCameraYawChange(Math.atan2(fwdV.x, fwdV.z));
      }
      _reportCameraState();
      return;
    }

    // Default: third-person chase camera
    const distance = serverCamera?.distance ?? defaultDistance;
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

    // Chase camera: translate by player movement delta
    const delta = head.clone().sub(lastPlayerPos.current);
    camera.position.add(delta);
    lastPlayerPos.current.copy(head);

    camera.up.lerp(up, 0.15).normalize();

    if (controlsRef.current) {
      const ctl = controlsRef.current;
      ctl.target.set(head.x, head.y, head.z);
      ctl.minDistance = minDistance;
      ctl.maxDistance = Math.max(distance * 1.5, maxDistance);
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
      const fwdV = new THREE.Vector3();
      camera.getWorldDirection(fwdV);
      const yaw = Math.atan2(fwdV.x, fwdV.z);
      onCameraYawChange(yaw);
    }

    _reportCameraState();
  });

  function _reportCameraState() {
    if (!onCameraStateChange) return;
    camera.getWorldDirection(_fwd.current);
    onCameraStateChange(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: _fwd.current.x, y: _fwd.current.y, z: _fwd.current.z }
    );
  }

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
