import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GameRuntime } from "@/lib/runtime";

/**
 * Reads `runtime.camera` each frame and drives the Three camera accordingly.
 * Supports four modes:
 *   - thirdPerson : OrbitControls around the player at `camera.distance`.
 *   - firstPerson : camera glued to the player head; OrbitControls disabled.
 *   - free        : OrbitControls free orbit, target stays where user dragged.
 *   - scripted    : reads `camera.position` / `camera.lookAt` directly.
 *
 * Always writes the resulting forward vector back to `runtime.cameraForward`
 * so movement input stays camera-relative.
 */
export default function ChaseCameraRig({
  runtime,
  shiftLock = false,
}: {
  runtime: GameRuntime;
  shiftLock?: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const lastPlayerPos = useRef(new THREE.Vector3());
  const lastUp = useRef(new THREE.Vector3(0, 1, 0));
  const initialized = useRef(false);

  useFrame(() => {
    const p = runtime.player;
    const cfg = runtime.camera;
    const head = new THREE.Vector3(
      p.position.x + cfg.offset.x,
      p.position.y + cfg.offset.y,
      p.position.z + cfg.offset.z,
    );
    const up = new THREE.Vector3(p.up.x, p.up.y, p.up.z).normalize();

    if (!initialized.current) {
      lastPlayerPos.current.copy(head);
      lastUp.current.copy(up);
      initialized.current = true;
    }

    if ((camera as any).fov !== cfg.fov) {
      (camera as any).fov = cfg.fov;
      (camera as any).updateProjectionMatrix?.();
    }

    if (cfg.mode === "scripted") {
      camera.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
      camera.up.lerp(up, 0.15).normalize();
      camera.lookAt(cfg.lookAt.x, cfg.lookAt.y, cfg.lookAt.z);
    } else if (cfg.mode === "firstPerson") {
      camera.position.set(head.x, head.y, head.z);
      camera.up.lerp(up, 0.15).normalize();
      // Look forward along player yaw.
      const yaw = p.rotation.y;
      camera.lookAt(head.x + Math.sin(yaw), head.y, head.z + Math.cos(yaw));
    } else {
      // thirdPerson / free: chase by translating last frame's delta.
      const delta = head.clone().sub(lastPlayerPos.current);
      camera.position.add(delta);
      lastPlayerPos.current.copy(head);

      if (!up.equals(lastUp.current)) {
        const q = new THREE.Quaternion().setFromUnitVectors(lastUp.current, up);
        const offset = camera.position.clone().sub(head).applyQuaternion(q);
        camera.position.copy(head).add(offset);
        lastUp.current.copy(up);
      }
      camera.up.lerp(up, 0.15).normalize();

      if (controlsRef.current) {
        const ctl = controlsRef.current;
        ctl.target.set(head.x, head.y, head.z);
        ctl.minDistance = cfg.minDistance;
        ctl.maxDistance = cfg.maxDistance;
        ctl.rotateSpeed = cfg.sensitivity;
        ctl.enableRotate = !(cfg.lockYaw && cfg.lockPitch) && !shiftLock;
        ctl.enabled = (cfg.mode as string) !== "firstPerson";
        ctl.update();

        // Shift lock: force camera directly behind the player
        if (shiftLock && p.rotation) {
          const yaw = p.rotation.y;
          const dist = cfg.distance ?? 6;
          const targetPos = new THREE.Vector3(
            head.x - Math.sin(yaw) * dist,
            head.y + dist * 0.35,
            head.z - Math.cos(yaw) * dist,
          );
          camera.position.lerp(targetPos, 0.12);
          ctl.update();
        }
      }
    }

    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    runtime.cameraForward.x = fwd.x;
    runtime.cameraForward.y = fwd.y;
    runtime.cameraForward.z = fwd.z;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.18}
      enablePan={false}
      minDistance={3}
      maxDistance={10}
    />
  );
}
