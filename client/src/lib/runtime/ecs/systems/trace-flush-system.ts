/**
 * TraceFlushSystem — finalizes per-tick trace records for the debug overlay.
 * This is the last system in the fixed order.
 */
import { defineSystem } from "../system";

export const TraceFlushSystem = defineSystem({
  id: "trace-flush",
  after: ["replication"],
  side: "both",
  run({ trace, tick }) {
    // The trace map automatically accumulates records during the tick.
    // This system just marks the tick as complete for any finalization needed.
    
    // In dev mode, we might flush to a debug overlay or console.
    // For now, records are available via trace.flush() when needed.
    
    // Future: could write to a rolling buffer for post-mortem debugging.
  },
});
