import type { GameRuntime } from "@/lib/runtime";

/**
 * HUD overlay that mirrors `runtime.gui` — text labels and clickable buttons
 * added from user scripts via `gui.text(...)` / `gui.button(...)`. Re-renders
 * whenever the parent passes a fresh `version` prop so script-driven changes
 * become visible immediately.
 */
export default function GuiOverlay({
  runtime,
  version: _v,
}: {
  runtime: GameRuntime;
  version: number;
}) {
  const items = Array.from(runtime.gui.values());
  if (items.length === 0) return null;
  return (
    <div className="absolute inset-0 z-20 pointer-events-none" data-testid="gui-overlay">
      {items.map((el) => {
        const style: React.CSSProperties = {
          position: "absolute",
          color: el.color,
          fontSize: el.size,
          background: el.bg,
          padding: el.kind === "button" ? "8px 14px" : el.bg ? "4px 8px" : 0,
          borderRadius: 6,
          whiteSpace: "nowrap",
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 600,
          textShadow: el.bg ? undefined : "0 1px 2px rgba(0,0,0,0.7)",
          lineHeight: 1.2,
        };
        const transforms: string[] = [];
        const v = el.anchor[0];
        const h = el.anchor[1];
        if (v === "t") style.top = el.y;
        else if (v === "b") style.bottom = el.y;
        else {
          style.top = "50%";
          transforms.push("translateY(-50%)");
        }
        if (h === "l") style.left = el.x;
        else if (h === "r") style.right = el.x;
        else {
          style.left = "50%";
          transforms.push("translateX(-50%)");
        }
        if (transforms.length) style.transform = transforms.join(" ");

        if (el.kind === "button") {
          return (
            <button
              key={el.id}
              style={{
                ...style,
                cursor: "pointer",
                pointerEvents: "auto",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
              onClick={() => runtime.invokeGuiClick(el.id)}
              data-testid={`gui-button-${el.id}`}
            >
              {el.text}
            </button>
          );
        }
        return (
          <div key={el.id} style={style} data-testid={`gui-text-${el.id}`}>
            {el.text}
          </div>
        );
      })}
    </div>
  );
}
