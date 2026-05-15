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
  componentDidCatch(err: Error) {
    console.error("[PlayCanvas]", err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
