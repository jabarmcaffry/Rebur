import { Component, type ReactNode } from "react";

/**
 * Catches render-time errors from the WebGL canvas (Three.js, R3F, etc.) and
 * shows a fallback so the rest of the UI keeps working. Pair with `<SVGScene>`
 * for a non-WebGL fallback render path.
 */
export default class PlayCanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error, info: any) {
    console.error("[PlayCanvas] render error:", err?.message ?? err, info?.componentStack?.split("\n")[1]?.trim());
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Lightweight error boundary used *inside* the R3F Canvas to isolate
 * avatar / model load failures. Shows a simple box avatar as fallback
 * so the rest of the scene keeps rendering.
 */
export class AvatarErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[Avatar] FBX load/render error — using box fallback:", err?.message ?? err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
