import { useRef, useState } from "react";

/**
 * On-screen analog stick for touch devices. Reports normalized (-1..1, -1..1)
 * to the parent on every move. Pure presentation — no engine awareness.
 */
export default function VirtualJoystick({
  onChange,
  side,
}: {
  onChange: (x: number, y: number) => void;
  side: "left" | "right";
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });

  const start = (e: React.PointerEvent) => {
    // Critical: stop the pointer from also reaching the R3F <Canvas> /
    // OrbitControls beneath us. Without this, the same finger that's
    // driving the joystick also rotates the camera, which made the player
    // appear to "shake" while turning + moving on touch devices.
    e.stopPropagation();
    e.preventDefault();
    const rect = baseRef.current!.getBoundingClientRect();
    center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    activeId.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    move(e);
  };

  const move = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - center.current.x;
    const dy = e.clientY - center.current.y;
    const max = 50;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampX = dist > max ? (dx / dist) * max : dx;
    const clampY = dist > max ? (dy / dist) * max : dy;
    setThumb({ x: clampX, y: clampY });
    onChange(clampX / max, clampY / max);
  };

  const end = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    e.stopPropagation();
    activeId.current = null;
    setThumb({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`absolute bottom-6 ${
        side === "left" ? "left-6" : "right-6"
      } w-28 h-28 rounded-full bg-black/30 border border-white/20 backdrop-blur-sm touch-none select-none z-20`}
      data-testid={`joystick-${side}`}
    >
      <div
        className="absolute w-12 h-12 rounded-full bg-white/70 border border-white/80"
        style={{
          left: `calc(50% - 1.5rem + ${thumb.x}px)`,
          top: `calc(50% - 1.5rem + ${thumb.y}px)`,
        }}
      />
    </div>
  );
}
