/**
 * Performance Profiler for the Game Runtime
 * 
 * Measures system execution times, frame budgets, and identifies hot paths.
 * Integrates with the trace system for comprehensive debugging.
 * 
 * Usage:
 *   const profiler = new Profiler();
 *   profiler.begin("Physics");
 *   // ... physics code ...
 *   profiler.end("Physics");
 *   
 *   const report = profiler.getReport();
 */

export interface ProfileSample {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  depth: number;
}

export interface ProfileStats {
  name: string;
  /** Total time spent in this section across all frames (ms) */
  totalTime: number;
  /** Average time per frame (ms) */
  avgTime: number;
  /** Minimum time (ms) */
  minTime: number;
  /** Maximum time (ms) */
  maxTime: number;
  /** Number of samples collected */
  sampleCount: number;
  /** Percentage of total frame time */
  percentage: number;
  /** Recent samples for sparkline visualization */
  recentSamples: number[];
}

export interface ProfileFrame {
  tick: number;
  startTime: number;
  endTime: number;
  totalDuration: number;
  samples: ProfileSample[];
  /** Frame budget utilization (target is 16.67ms for 60fps) */
  budgetUtilization: number;
}

export interface ProfileReport {
  /** Stats per system/phase */
  stats: Map<string, ProfileStats>;
  /** Recent frame data */
  recentFrames: ProfileFrame[];
  /** Overall frame rate stats */
  fps: {
    current: number;
    avg: number;
    min: number;
    max: number;
  };
  /** Memory usage if available */
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  /** Hot paths - sections consuming most time */
  hotPaths: Array<{ name: string; percentage: number }>;
  /** Warnings for performance issues */
  warnings: string[];
}

/** Performance marks for the current frame */
interface ActiveMark {
  name: string;
  startTime: number;
  depth: number;
}

/**
 * Ring buffer for efficient sample storage
 */
class RingBuffer<T> {
  private buffer: T[] = [];
  private writeIndex = 0;
  private count = 0;

  constructor(private capacity: number) {}

  push(item: T): void {
    if (this.count < this.capacity) {
      this.buffer.push(item);
      this.count++;
    } else {
      this.buffer[this.writeIndex] = item;
    }
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
  }

  toArray(): T[] {
    if (this.count < this.capacity) {
      return [...this.buffer];
    }
    // Return in chronological order
    return [
      ...this.buffer.slice(this.writeIndex),
      ...this.buffer.slice(0, this.writeIndex),
    ];
  }

  get length(): number {
    return this.count;
  }

  clear(): void {
    this.buffer = [];
    this.writeIndex = 0;
    this.count = 0;
  }
}

/**
 * Aggregated stats for a named section
 */
class SectionStats {
  totalTime = 0;
  minTime = Infinity;
  maxTime = -Infinity;
  sampleCount = 0;
  recentSamples = new RingBuffer<number>(60); // Last 60 samples

  add(duration: number): void {
    this.totalTime += duration;
    this.minTime = Math.min(this.minTime, duration);
    this.maxTime = Math.max(this.maxTime, duration);
    this.sampleCount++;
    this.recentSamples.push(duration);
  }

  get avgTime(): number {
    return this.sampleCount > 0 ? this.totalTime / this.sampleCount : 0;
  }
}

/**
 * Main Profiler class
 */
export class Profiler {
  /** Whether profiling is enabled */
  enabled = false;
  
  /** Target frame time in ms (16.67ms = 60fps) */
  targetFrameTime = 16.67;
  
  /** Warning threshold as percentage of frame budget */
  warningThreshold = 0.8;
  
  /** Maximum frames to keep in history */
  maxFrameHistory = 120;
  
  /** Maximum samples per second to track */
  maxSamplesPerSecond = 1000;

  private stats = new Map<string, SectionStats>();
  private frameHistory = new RingBuffer<ProfileFrame>(120);
  private currentFrame: ProfileFrame | null = null;
  private activeMarks: ActiveMark[] = [];
  private depth = 0;
  private tick = 0;
  
  // FPS tracking
  private frameTimestamps = new RingBuffer<number>(60);
  private fpsMin = Infinity;
  private fpsMax = 0;
  private fpsSum = 0;
  private fpsCount = 0;

  /**
   * Start profiling a new frame
   */
  beginFrame(tick: number): void {
    if (!this.enabled) return;
    
    this.tick = tick;
    this.currentFrame = {
      tick,
      startTime: performance.now(),
      endTime: 0,
      totalDuration: 0,
      samples: [],
      budgetUtilization: 0,
    };
    this.activeMarks = [];
    this.depth = 0;
  }

  /**
   * End profiling the current frame
   */
  endFrame(): void {
    if (!this.enabled || !this.currentFrame) return;
    
    // Close any unclosed marks
    while (this.activeMarks.length > 0) {
      const mark = this.activeMarks.pop()!;
      this.endInternal(mark.name, mark.startTime);
    }
    
    this.currentFrame.endTime = performance.now();
    this.currentFrame.totalDuration = this.currentFrame.endTime - this.currentFrame.startTime;
    this.currentFrame.budgetUtilization = this.currentFrame.totalDuration / this.targetFrameTime;
    
    this.frameHistory.push(this.currentFrame);
    
    // Update FPS tracking
    this.frameTimestamps.push(this.currentFrame.startTime);
    const fps = this.calculateCurrentFPS();
    if (fps > 0) {
      this.fpsMin = Math.min(this.fpsMin, fps);
      this.fpsMax = Math.max(this.fpsMax, fps);
      this.fpsSum += fps;
      this.fpsCount++;
    }
    
    this.currentFrame = null;
  }

  /**
   * Begin timing a named section
   */
  begin(name: string): void {
    if (!this.enabled || !this.currentFrame) return;
    
    this.activeMarks.push({
      name,
      startTime: performance.now(),
      depth: this.depth,
    });
    this.depth++;
  }

  /**
   * End timing a named section
   */
  end(name: string): void {
    if (!this.enabled || !this.currentFrame) return;
    
    // Find the matching mark
    const markIndex = this.activeMarks.findLastIndex(m => m.name === name);
    if (markIndex === -1) {
      console.warn(`[Profiler] end("${name}") called without matching begin()`);
      return;
    }
    
    const mark = this.activeMarks.splice(markIndex, 1)[0];
    this.depth = Math.max(0, this.depth - 1);
    this.endInternal(name, mark.startTime, mark.depth);
  }

  private endInternal(name: string, startTime: number, depth = 0): void {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Record sample
    const sample: ProfileSample = {
      name,
      startTime,
      endTime,
      duration,
      depth,
    };
    this.currentFrame!.samples.push(sample);
    
    // Update stats
    let sectionStats = this.stats.get(name);
    if (!sectionStats) {
      sectionStats = new SectionStats();
      this.stats.set(name, sectionStats);
    }
    sectionStats.add(duration);
  }

  /**
   * Wrap a function with profiling
   */
  wrap<T>(name: string, fn: () => T): T {
    this.begin(name);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  }

  /**
   * Async wrapper for profiling
   */
  async wrapAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.begin(name);
    try {
      return await fn();
    } finally {
      this.end(name);
    }
  }

  /**
   * Calculate current FPS from recent frame timestamps
   */
  private calculateCurrentFPS(): number {
    const timestamps = this.frameTimestamps.toArray();
    if (timestamps.length < 2) return 0;
    
    const oldest = timestamps[0];
    const newest = timestamps[timestamps.length - 1];
    const elapsed = newest - oldest;
    
    if (elapsed === 0) return 0;
    return ((timestamps.length - 1) / elapsed) * 1000;
  }

  /**
   * Get the current profiling report
   */
  getReport(): ProfileReport {
    const totalFrameTime = Array.from(this.stats.values())
      .reduce((sum, s) => sum + s.totalTime, 0);
    
    // Build stats map
    const statsMap = new Map<string, ProfileStats>();
    for (const [name, section] of this.stats) {
      statsMap.set(name, {
        name,
        totalTime: section.totalTime,
        avgTime: section.avgTime,
        minTime: section.minTime === Infinity ? 0 : section.minTime,
        maxTime: section.maxTime === -Infinity ? 0 : section.maxTime,
        sampleCount: section.sampleCount,
        percentage: totalFrameTime > 0 ? (section.totalTime / totalFrameTime) * 100 : 0,
        recentSamples: section.recentSamples.toArray(),
      });
    }
    
    // Identify hot paths
    const hotPaths = Array.from(statsMap.values())
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5)
      .map(s => ({ name: s.name, percentage: s.percentage }));
    
    // Generate warnings
    const warnings: string[] = [];
    const recentFrames = this.frameHistory.toArray();
    
    // Check for frame budget overruns
    const overrunFrames = recentFrames.filter(f => f.budgetUtilization > 1);
    if (overrunFrames.length > recentFrames.length * 0.1) {
      warnings.push(`${overrunFrames.length} frames exceeded budget in last ${recentFrames.length} frames`);
    }
    
    // Check for spiky sections
    for (const [name, section] of this.stats) {
      if (section.maxTime > section.avgTime * 3 && section.sampleCount > 10) {
        warnings.push(`"${name}" has high variance (max: ${section.maxTime.toFixed(2)}ms, avg: ${section.avgTime.toFixed(2)}ms)`);
      }
    }
    
    // Get memory info if available
    let memory: ProfileReport["memory"];
    if (typeof performance !== "undefined" && (performance as any).memory) {
      const mem = (performance as any).memory;
      memory = {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      };
    }
    
    return {
      stats: statsMap,
      recentFrames,
      fps: {
        current: this.calculateCurrentFPS(),
        avg: this.fpsCount > 0 ? this.fpsSum / this.fpsCount : 0,
        min: this.fpsMin === Infinity ? 0 : this.fpsMin,
        max: this.fpsMax,
      },
      memory,
      hotPaths,
      warnings,
    };
  }

  /**
   * Export profiling data as JSON for external analysis
   */
  exportJSON(): string {
    const report = this.getReport();
    return JSON.stringify({
      stats: Array.from(report.stats.entries()),
      recentFrames: report.recentFrames,
      fps: report.fps,
      memory: report.memory,
      hotPaths: report.hotPaths,
      warnings: report.warnings,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * Reset all profiling data
   */
  reset(): void {
    this.stats.clear();
    this.frameHistory.clear();
    this.frameTimestamps.clear();
    this.currentFrame = null;
    this.activeMarks = [];
    this.depth = 0;
    this.fpsMin = Infinity;
    this.fpsMax = 0;
    this.fpsSum = 0;
    this.fpsCount = 0;
  }

  /**
   * Get a summary string suitable for debug overlay
   */
  getSummary(): string {
    if (!this.enabled) return "Profiler disabled";
    
    const fps = this.calculateCurrentFPS();
    const report = this.getReport();
    const lines: string[] = [
      `FPS: ${fps.toFixed(1)} (avg: ${report.fps.avg.toFixed(1)}, min: ${report.fps.min.toFixed(1)}, max: ${report.fps.max.toFixed(1)})`,
    ];
    
    // Top 5 systems by time
    const topSystems = report.hotPaths.slice(0, 5);
    if (topSystems.length > 0) {
      lines.push("Top systems:");
      for (const sys of topSystems) {
        const stats = report.stats.get(sys.name);
        if (stats) {
          lines.push(`  ${sys.name}: ${stats.avgTime.toFixed(2)}ms (${sys.percentage.toFixed(1)}%)`);
        }
      }
    }
    
    // Warnings
    if (report.warnings.length > 0) {
      lines.push("Warnings:");
      for (const w of report.warnings.slice(0, 3)) {
        lines.push(`  - ${w}`);
      }
    }
    
    return lines.join("\n");
  }
}

/** Global profiler instance */
export const globalProfiler = new Profiler();
