/**
 * cluster-manager.ts
 *
 * Multi-tenant compute clustering for Rebur game instances.
 *
 * Concepts:
 *  – Cluster: a logical grouping of game instances that share compute.
 *    In production this maps to a physical machine or container pool.
 *    In development it's just a namespace for tracking and reporting.
 *  – Tier: small / medium / large, based on observed player count.
 *  – Predictive scaling: hourly activity is recorded per game so we can
 *    warm up popular instances before demand spikes.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max concurrent instances per cluster tier. */
const CLUSTER_CAPS: Record<ClusterTier, number> = {
  small:  20,
  medium: 8,
  large:  2,
};

/** Player-count thresholds for tier classification. */
const TIER_THRESHOLDS = { medium: 5, large: 20 };

/** Keep hourly buckets for this many hours. */
const HISTORY_HOURS = 48;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClusterTier = "small" | "medium" | "large";

export interface ClusterRecord {
  id: string;
  tier: ClusterTier;
  instanceIds: Set<string>;
  totalPlayers: number;
}

interface ActivityBucket {
  hour: number;   // Unix hour (Math.floor(Date.now() / 3_600_000))
  players: number;
}

interface GameActivityHistory {
  gameId: string;
  buckets: ActivityBucket[];   // last HISTORY_HOURS entries
  peakPlayers: number;
}

export interface ClusterLoadReport {
  clusters: {
    id: string;
    tier: ClusterTier;
    instanceCount: number;
    totalPlayers: number;
    utilizationPct: number;
  }[];
  totalInstances: number;
  totalPlayers: number;
  predictiveWarmList: string[];   // gameIds to pre-warm
}

// ── ClusterManager ────────────────────────────────────────────────────────────

export class ClusterManager {
  private clusters    = new Map<string, ClusterRecord>();
  private sessionToCluster = new Map<string, string>();  // sessionId → clusterId
  private activityHistory = new Map<string, GameActivityHistory>(); // gameId → history
  private clusterCounter  = 0;

  // ── Registration ───────────────────────────────────────────────────────────

  /** Called when a new game instance starts. Assigns it to an appropriate cluster. */
  registerInstance(sessionId: string, gameId: string, initialPlayers = 0): string {
    const tier = this._tierForCount(initialPlayers);
    const clusterId = this._findOrCreateCluster(tier, sessionId);
    const cluster = this.clusters.get(clusterId)!;
    cluster.instanceIds.add(sessionId);
    cluster.totalPlayers += initialPlayers;
    this.sessionToCluster.set(sessionId, clusterId);
    console.log(`[cluster] registered session=${sessionId} game=${gameId} cluster=${clusterId} tier=${tier}`);
    return clusterId;
  }

  /** Update player count for a session — may trigger a tier migration. */
  updatePlayerCount(sessionId: string, newCount: number, oldCount = 0): void {
    const clusterId = this.sessionToCluster.get(sessionId);
    if (!clusterId) return;

    const cluster = this.clusters.get(clusterId)!;
    cluster.totalPlayers = Math.max(0, cluster.totalPlayers - oldCount + newCount);

    const newTier = this._tierForCount(newCount);
    if (newTier !== cluster.tier) {
      // Migrate this instance to an appropriate tier cluster
      cluster.instanceIds.delete(sessionId);
      cluster.totalPlayers = Math.max(0, cluster.totalPlayers - newCount);
      this._cleanEmptyCluster(clusterId);

      const newClusterId = this._findOrCreateCluster(newTier, sessionId);
      const newCluster = this.clusters.get(newClusterId)!;
      newCluster.instanceIds.add(sessionId);
      newCluster.totalPlayers += newCount;
      this.sessionToCluster.set(sessionId, newClusterId);
      console.log(`[cluster] migrated session=${sessionId} ${cluster.tier}→${newTier} cluster=${newClusterId}`);
    }
  }

  /** Called when an instance is terminated. */
  unregisterInstance(sessionId: string, lastPlayerCount = 0): void {
    const clusterId = this.sessionToCluster.get(sessionId);
    if (!clusterId) return;
    const cluster = this.clusters.get(clusterId);
    if (cluster) {
      cluster.instanceIds.delete(sessionId);
      cluster.totalPlayers = Math.max(0, cluster.totalPlayers - lastPlayerCount);
      this._cleanEmptyCluster(clusterId);
    }
    this.sessionToCluster.delete(sessionId);
  }

  // ── Activity recording ─────────────────────────────────────────────────────

  /** Record a player-count sample for a game (call periodically, e.g. every minute). */
  recordActivity(gameId: string, playerCount: number): void {
    const hour = Math.floor(Date.now() / 3_600_000);
    let history = this.activityHistory.get(gameId);
    if (!history) {
      history = { gameId, buckets: [], peakPlayers: 0 };
      this.activityHistory.set(gameId, history);
    }

    const last = history.buckets[history.buckets.length - 1];
    if (last && last.hour === hour) {
      last.players = Math.max(last.players, playerCount);
    } else {
      history.buckets.push({ hour, players: playerCount });
      if (history.buckets.length > HISTORY_HOURS) history.buckets.shift();
    }

    if (playerCount > history.peakPlayers) history.peakPlayers = playerCount;
  }

  // ── Predictive scaling ─────────────────────────────────────────────────────

  /**
   * Returns gameIds that historically spike in the next hour.
   * Use this to pre-warm sleeping instances before demand hits.
   */
  getPredictiveWarmList(): string[] {
    const currentHour = Math.floor(Date.now() / 3_600_000);
    const sameHourLastWeek  = currentHour - 24 * 7;
    const sameHourYesterday = currentHour - 24;

    const candidates: { gameId: string; score: number }[] = [];

    for (const [gameId, history] of this.activityHistory) {
      const lastWeekBucket    = history.buckets.find(b => b.hour === sameHourLastWeek);
      const yesterdayBucket   = history.buckets.find(b => b.hour === sameHourYesterday);
      const lastWeekPlayers   = lastWeekBucket?.players ?? 0;
      const yesterdayPlayers  = yesterdayBucket?.players ?? 0;

      // Weighted average: yesterday counts 2x
      const predicted = (lastWeekPlayers + yesterdayPlayers * 2) / 3;
      if (predicted >= 2) {
        candidates.push({ gameId, score: predicted });
      }
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(c => c.gameId);
  }

  // ── Reporting ──────────────────────────────────────────────────────────────

  getLoadReport(): ClusterLoadReport {
    const clusterRows = Array.from(this.clusters.values()).map(c => ({
      id: c.id,
      tier: c.tier,
      instanceCount: c.instanceIds.size,
      totalPlayers: c.totalPlayers,
      utilizationPct: Math.round((c.instanceIds.size / CLUSTER_CAPS[c.tier]) * 100),
    }));

    const totalInstances = clusterRows.reduce((s, r) => s + r.instanceCount, 0);
    const totalPlayers   = clusterRows.reduce((s, r) => s + r.totalPlayers, 0);

    return {
      clusters: clusterRows,
      totalInstances,
      totalPlayers,
      predictiveWarmList: this.getPredictiveWarmList(),
    };
  }

  getClusterForSession(sessionId: string): ClusterRecord | undefined {
    const id = this.sessionToCluster.get(sessionId);
    return id ? this.clusters.get(id) : undefined;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private _tierForCount(playerCount: number): ClusterTier {
    if (playerCount >= TIER_THRESHOLDS.large)  return "large";
    if (playerCount >= TIER_THRESHOLDS.medium) return "medium";
    return "small";
  }

  /**
   * Find a cluster of the given tier that isn't full,
   * or create a new one if all are at capacity.
   */
  private _findOrCreateCluster(tier: ClusterTier, _sessionId: string): string {
    for (const [id, c] of this.clusters) {
      if (c.tier === tier && c.instanceIds.size < CLUSTER_CAPS[tier]) return id;
    }
    const id = `cluster-${tier}-${++this.clusterCounter}`;
    this.clusters.set(id, { id, tier, instanceIds: new Set(), totalPlayers: 0 });
    console.log(`[cluster] created cluster=${id} tier=${tier}`);
    return id;
  }

  private _cleanEmptyCluster(clusterId: string): void {
    const c = this.clusters.get(clusterId);
    if (c && c.instanceIds.size === 0) {
      this.clusters.delete(clusterId);
      console.log(`[cluster] removed empty cluster=${clusterId}`);
    }
  }
}

export const clusterManager = new ClusterManager();
