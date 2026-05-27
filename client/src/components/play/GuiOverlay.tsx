import type { RenderGuiElement } from "@shared/render-types";

/**
 * HUD overlay that renders GUI elements from server state.
 * Supports text labels, clickable buttons, progress bars, and images.
 */
export default function GuiOverlay({
  gui,
  onGuiClick,
}: {
  gui: RenderGuiElement[];
  onGuiClick: (elementId: string) => void;
}) {
  if (gui.length === 0) return null;

  return (
    // Start below the engine top-bar (≈48 px) so game-created UI elements
    // don't overlap the menu, chat and leaderboard buttons (z-50).
    <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none" style={{ top: "48px" }} data-testid="gui-overlay">
      {gui.map((el) => {
        if (!el.visible) return null;

        const style: React.CSSProperties = {
          position: "absolute",
          color: el.color,
          fontSize: el.fontSize,
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 600,
          lineHeight: 1.2,
        };

        // Parse anchor position (e.g., "topLeft", "center", "bottomRight")
        const anchor = el.anchor.toLowerCase();
        const transforms: string[] = [];

        // Vertical positioning
        if (anchor.includes("top")) {
          style.top = el.y;
        } else if (anchor.includes("bottom")) {
          style.bottom = el.y;
        } else {
          style.top = "50%";
          transforms.push("translateY(-50%)");
          style.top = `calc(50% + ${el.y}px)`;
        }

        // Horizontal positioning
        if (anchor.includes("left")) {
          style.left = el.x;
        } else if (anchor.includes("right")) {
          style.right = el.x;
        } else {
          style.left = "50%";
          transforms.push("translateX(-50%)");
          style.left = `calc(50% + ${el.x}px)`;
        }

        if (transforms.length) style.transform = transforms.join(" ");

        // Render based on element kind
        if (el.kind === "button") {
          return (
            <button
              key={el.id}
              style={{
                ...style,
                width: el.width,
                height: el.height,
                background: el.backgroundColor ?? "#3b82f6",
                padding: "8px 14px",
                borderRadius: 6,
                cursor: "pointer",
                pointerEvents: "auto",
                border: "1px solid rgba(255,255,255,0.18)",
                whiteSpace: "nowrap",
                textShadow: "none",
              }}
              onClick={() => onGuiClick(el.id)}
              data-testid={`gui-button-${el.id}`}
            >
              {el.text}
            </button>
          );
        }

        if (el.kind === "bar") {
          const value = el.value ?? 0;
          const maxValue = el.maxValue ?? 100;
          const percent = Math.max(0, Math.min(100, (value / maxValue) * 100));

          return (
            <div
              key={el.id}
              style={{
                ...style,
                width: el.width ?? 100,
                height: el.height ?? 12,
                background: el.backgroundColor ?? "#374151",
                borderRadius: 6,
                overflow: "hidden",
              }}
              data-testid={`gui-bar-${el.id}`}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  background: el.color ?? "#22c55e",
                  transition: "width 150ms ease-out",
                }}
              />
            </div>
          );
        }

        if (el.kind === "image") {
          return (
            <img
              key={el.id}
              src={el.imageUrl}
              alt=""
              style={{
                ...style,
                width: el.width ?? 64,
                height: el.height ?? 64,
                objectFit: "contain",
              }}
              data-testid={`gui-image-${el.id}`}
            />
          );
        }

        // Default: text element
        return (
          <div
            key={el.id}
            style={{
              ...style,
              background: el.backgroundColor,
              padding: el.backgroundColor ? "4px 8px" : 0,
              borderRadius: 6,
              whiteSpace: "nowrap",
              textShadow: el.backgroundColor ? undefined : "0 1px 2px rgba(0,0,0,0.7)",
            }}
            data-testid={`gui-text-${el.id}`}
          >
            {el.text}
          </div>
        );
      })}
    </div>
  );
}
