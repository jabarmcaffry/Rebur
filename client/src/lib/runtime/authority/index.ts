/**
 * Authority System Exports
 * 
 * Provides the infrastructure for client-server authority separation.
 */

export { ServerSim, type ServerSimOptions, type ServerSnapshot } from "./server-sim";
export { ClientView } from "./client-view";
export { createWebSocketServer, createWebSocketClient, type TransportMessage, type TransportHandler } from "./transport";
export {
  AuthorityManager,
  globalAuthority,
  createServerContext,
  createClientContext,
  SCRIPT_AUTHORITY,
  CONTAINER_AUTHORITY,
  type AuthorityContext,
  type ServerAuthorityState,
  type ServerObjectState,
  type ServerPlayerState,
  type ClientAuthorityState,
  type InputFrame,
} from "./authority-manager";
