import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import type { GameObject } from "@shared/schema";

interface Props {
  objects: GameObject[];
  selectedId?: string | null;
  onSelectObject?: (id: string | null) => void;
  /** Legacy runtime parameter - no longer used */
  runtime?: any;
  /** Initial camera position. */
  cameraPosition?: [number, number, number];
}

function makeGeometry(obj: GameObject): THREE.BufferGeometry {
  if (obj.type === "light") return new THREE.SphereGeometry(0.2, 12, 12);
  switch (obj.primitiveType) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 16, 16);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    case "plane":
      return new THREE.PlaneGeometry(1, 1);
    case "cube":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function meshKey(obj: GameObject): string {
  return `${obj.id}::${obj.type}::${obj.primitiveType ?? ""}`;
}

export default function SVGScene({
  objects,
  selectedId,
  onSelectObject,
  runtime,
  cameraPosition = [6, 5, 6],
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const objectsRef = useRef(objects);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelectObject);
  const runtimeRef = useRef(runtime);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    onSelectRef.current = onSelectObject;
  }, [onSelectObject]);
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1a1d24");

    const initialW = mount.clientWidth || 800;
    const initialH = mount.clientHeight || 600;

    const camera = new THREE.PerspectiveCamera(50, initialW / initialH, 0.1, 1000);
    camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
    camera.lookAt(0, 0, 0);

    const renderer = new SVGRenderer();
    renderer.setSize(initialW, initialH);
    const svg = renderer.domElement as unknown as SVGElement;
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";
    svg.style.touchAction = "none";
    mount.innerHTML = "";
    mount.appendChild(svg);

    // Lighting (Lambert reads ambient + directional)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(10, 12, 8);
    scene.add(dirLight);

    // Ground grid overlay - floor comes from Baseplate object which is deletable
    const grid = new THREE.GridHelper(40, 40, 0x6a7384, 0x3a3f4b);
    grid.position.y = 0.51;
    scene.add(grid);

    // Per-object meshes (with selection outline child)
    type Entry = { mesh: THREE.Mesh; outline: THREE.Mesh; key: string };
    const meshMap = new Map<string, Entry>();

    function addObject(obj: GameObject) {
      const geo = makeGeometry(obj);
      const mat = new THREE.MeshLambertMaterial({ color: obj.color ?? "#888888" });
      const mesh = new THREE.Mesh(geo, mat);

      const outlineMat = new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        wireframe: true,
        transparent: true,
        opacity: 0,
      });
      const outline = new THREE.Mesh(geo.clone(), outlineMat);
      outline.scale.set(1.04, 1.04, 1.04);
      mesh.add(outline);

      mesh.userData.objectId = obj.id;
      scene.add(mesh);
      meshMap.set(obj.id, { mesh, outline, key: meshKey(obj) });
      applyTransform(mesh, obj);
    }

    function applyTransform(mesh: THREE.Mesh, obj: GameObject) {
      mesh.position.set(obj.positionX ?? 0, obj.positionY ?? 0, obj.positionZ ?? 0);
      mesh.rotation.set(obj.rotationX ?? 0, obj.rotationY ?? 0, obj.rotationZ ?? 0);
      mesh.scale.set(obj.scaleX ?? 1, obj.scaleY ?? 1, obj.scaleZ ?? 1);
      const m = mesh.material as THREE.MeshLambertMaterial;
      m.color.set(obj.color ?? "#888888");
      const props = (obj.properties ?? {}) as Record<string, any>;
      const transparency = Math.max(0, Math.min(1, Number(props.transparency ?? 0)));
      m.transparent = transparency > 0;
      m.opacity = 1 - transparency;
      mesh.visible = m.opacity > 0.01;
    }

    function removeObject(id: string) {
      const entry = meshMap.get(id);
      if (!entry) return;
      scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
      entry.outline.geometry.dispose();
      (entry.outline.material as THREE.Material).dispose();
      meshMap.delete(id);
    }

    // Avatar (only in play mode)
    let avatar: THREE.Group | null = null;
    if (runtimeRef.current) {
      avatar = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12),
        new THREE.MeshLambertMaterial({ color: runtimeRef.current.player.color })
      );
      body.position.y = 0.4;
      avatar.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshLambertMaterial({ color: 0xf5d0a9 })
      );
      head.position.y = 1.25;
      avatar.add(head);
      scene.add(avatar);
    }

    // Camera state (orbit)
    const initialDist = Math.hypot(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
    const camState = {
      yaw: Math.atan2(cameraPosition[0], cameraPosition[2]),
      pitch: Math.asin(cameraPosition[1] / Math.max(0.0001, initialDist)),
      distance: initialDist,
      target: new THREE.Vector3(0, 0, 0),
    };

    function updateCamera() {
      const t = camState.target;
      const d = camState.distance;
      const cp = Math.cos(camState.pitch);
      camera.position.x = t.x + d * cp * Math.sin(camState.yaw);
      camera.position.y = t.y + d * Math.sin(camState.pitch);
      camera.position.z = t.z + d * cp * Math.cos(camState.yaw);
      camera.lookAt(t);
      const rt = runtimeRef.current;
      if (rt) rt.cameraYaw = camState.yaw;
    }

    updateCamera();

    // Pointer interactions: drag to orbit, click (no drag) to select.
    let dragging = false;
    let dragMoved = 0;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let activePointer: number | null = null;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      dragMoved = 0;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      activePointer = e.pointerId;
      try {
        (svg as any).setPointerCapture?.(e.pointerId);
      } catch {}
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== activePointer) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      camState.yaw -= dx * 0.005;
      camState.pitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, camState.pitch + dy * 0.005));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      dragging = false;
      activePointer = null;
      try {
        (svg as any).releasePointerCapture?.(e.pointerId);
      } catch {}

      // Click-to-select if we didn't drag.
      if (dragMoved < 5 && onSelectRef.current) {
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        const meshes = Array.from(meshMap.values()).map((m) => m.mesh);
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const id = (hits[0].object as THREE.Mesh).userData.objectId as string;
          onSelectRef.current(id);
        } else {
          onSelectRef.current(null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camState.distance = Math.max(2, Math.min(40, camState.distance + e.deltaY * 0.01));
    };

    svg.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("wheel", onWheel, { passive: false });

    // Resize
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    // Render / sync loop
    let raf = 0;
    const renderFrame = () => {
      // 1) Sync mesh set with current objects (add/remove/update)
      const currentObjects = objectsRef.current;
      const seen = new Set<string>();
      for (const obj of currentObjects) {
        seen.add(obj.id);
        const entry = meshMap.get(obj.id);
        if (!entry || entry.key !== meshKey(obj)) {
          // Geometry changed (e.g. type swap) – rebuild
          if (entry) removeObject(obj.id);
          addObject(obj);
        } else {
          applyTransform(entry.mesh, obj);
        }
      }
      for (const id of Array.from(meshMap.keys())) {
        if (!seen.has(id)) removeObject(id);
      }

      // 2) Apply runtime overrides (play mode rotates / moves objects through scripts)
      const rt = runtimeRef.current;
      if (rt) {
        for (const o of rt.objectList) {
          const entry = meshMap.get(o.id);
          if (entry) {
            entry.mesh.position.set(o.position.x, o.position.y, o.position.z);
            entry.mesh.rotation.set(o.rotation.x, o.rotation.y, o.rotation.z);
            entry.mesh.scale.set(o.scale.x, o.scale.y, o.scale.z);
            const m = entry.mesh.material as THREE.MeshLambertMaterial;
            m.color.set(o.color);
            m.transparent = (o.transparency ?? 0) > 0;
            m.opacity = 1 - (o.transparency ?? 0);
            entry.mesh.visible = o.visible && m.opacity > 0.01;
          }
        }
        if (avatar) {
          avatar.position.set(rt.player.position.x, rt.player.position.y, rt.player.position.z);
          // Auto-orient SVG avatar to player.up (feet point toward gravity).
          const upV = new THREE.Vector3(rt.player.up.x, rt.player.up.y, rt.player.up.z).normalize();
          avatar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upV);
          // Apply yaw within the local frame.
          avatar.rotateY(rt.player.rotation.y);
          camState.target.set(rt.player.position.x, rt.player.position.y + 0.7, rt.player.position.z);
        }
      }

      // 3) Selection outline
      const sel = selectedIdRef.current;
      for (const [id, entry] of meshMap) {
        const om = entry.outline.material as THREE.MeshBasicMaterial;
        om.opacity = id === sel ? 1 : 0;
      }

      updateCamera();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(renderFrame);
    };
    raf = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      svg.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      svg.removeEventListener("wheel", onWheel);
      for (const id of Array.from(meshMap.keys())) removeObject(id);
      if (mount.contains(svg)) mount.removeChild(svg);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="w-full h-full" data-testid="svg-scene" />;
}
