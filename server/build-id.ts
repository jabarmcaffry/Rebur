/**
 * BUILD_ID is stamped once per server process startup.
 * It is injected into every served index.html and exposed via /api/version.
 * The client polls /api/version and forces a hard reload when the id changes.
 */
export const BUILD_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
