/**
 * OOP façade entry point. Creator-facing API stays in the existing
 * `scripting/api-builder.ts`; this file re-exports proxy factories so the
 * api-builder can swap mutation paths to commands when the new pipeline is
 * enabled.
 */
export { createObjectProxy } from "./proxies";
