/**
 * Thin wrapper over the existing NetworkBus so server-authoritative code
 * doesn't import `network.ts` directly. When real WebSocket transport lands
 * only this file changes.
 */
import { NetworkBus } from "../network";

export class Transport {
  readonly bus = new NetworkBus();

  /** Send a command from a client up to the server. */
  sendCommand(payload: unknown) {
    this.bus.client.send("cmd", payload);
  }

  onCommand(fn: (payload: unknown) => void) {
    return this.bus.server.on("cmd", fn);
  }

  broadcastSnapshot(payload: unknown) {
    this.bus.server.broadcast("__snapshot", payload);
  }

  onSnapshot(fn: (payload: unknown) => void) {
    return this.bus.client.on("__snapshot", fn);
  }
}
