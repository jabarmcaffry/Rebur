/**
 * Timer Manager
 * 
 * Handles scheduled callbacks (every/after) and timer execution.
 */

import { formatErr } from "../utils/helpers";

export interface ScheduledTimer {
  fn: () => void;
  nextAt: number;
  interval: number;
  once: boolean;
}

/**
 * Create a timer manager
 */
export function createTimerManager(pushLog: (line: string) => void) {
  const timers: ScheduledTimer[] = [];

  return {
    /**
     * Schedule a recurring callback
     */
    every(seconds: number, fn: () => void, currentTime: number): () => void {
      const t: ScheduledTimer = { 
        fn, 
        nextAt: currentTime + seconds, 
        interval: seconds, 
        once: false 
      };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },

    /**
     * Schedule a one-time callback
     */
    after(seconds: number, fn: () => void, currentTime: number): () => void {
      const t: ScheduledTimer = { 
        fn, 
        nextAt: currentTime + seconds, 
        interval: seconds, 
        once: true 
      };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },

    /**
     * Process timers for current frame
     */
    step(currentTime: number): void {
      for (let i = timers.length - 1; i >= 0; i--) {
        const t = timers[i];
        if (currentTime < t.nextAt) continue;
        
        try {
          t.fn();
        } catch (e: any) {
          pushLog(`timer error: ${formatErr(e)}`);
        }
        
        if (t.once) {
          timers.splice(i, 1);
        } else {
          t.nextAt = currentTime + t.interval;
        }
      }
    },

    /**
     * Clear all timers
     */
    clear(): void {
      timers.length = 0;
    },

    /**
     * Get timer count
     */
    get count(): number {
      return timers.length;
    },
  };
}

export type TimerManager = ReturnType<typeof createTimerManager>;
