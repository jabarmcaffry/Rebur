import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import {
  Activity, Cpu, Users, Server, Zap, Clock,
  RefreshCw, Trash2, ChevronLeft, CircleDot,
  Moon, AlertTriangle, BarChart3, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InstanceSummary {
  active: number; idle: number; sleeping: number; total: number; totalPlayers: number;
}

interface InstanceStat {
  sessionId: string; gameId: string;
  state: "active" | "idle" | "sleeping" | "terminated";
  playerCount: number; tickRateHz: number;
  uptimeMs: number; wakeCount: number; totalPlayerJoins: number;
}

interface ClusterRow {
  id: string; tier: "small" | "medium" | "large";
  instanceCount: number; totalPlayers: number; utilizationPct: number;
}

interface ClusterReport {
  clusters: ClusterRow[]; totalInstances: number; totalPlayers: number;
  predictiveWarmList: string[];
}

interface PhysicsPreset {
  name: string; description: string;
  gravity: number; airDrag: number; tickRateHz: number; interestRadius: number;
}

interface Metrics {
  uptimeMs: number;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  instances: InstanceSummary;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function StateBadge({ state }: { state: InstanceStat["state"] }) {
  const map = {
    active:     { label: "Active",     className: "bg-green-500/20 text-green-400 border-green-500/30" },
    idle:       { label: "Idle",       className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    sleeping:   { label: "Sleeping",   className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    terminated: { label: "Terminated", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const { label, className } = map[state] ?? map.terminated;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {state === "active" && <CircleDot className="w-3 h-3" />}
      {state === "idle"   && <Clock     className="w-3 h-3" />}
      {state === "sleeping" && <Moon    className="w-3 h-3" />}
      {state === "terminated" && <AlertTriangle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function TierBadge({ tier }: { tier: ClusterRow["tier"] }) {
  const map = {
    small:  "bg-slate-500/20 text-slate-300 border-slate-500/30",
    medium: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    large:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${map[tier]}`}>
      {tier}
    </span>
  );
}

function UtilBar({ pct }: { pct: number }) {
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-9 text-right">{pct}%</span>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color = "text-white" }: {
  icon: React.ComponentType<any>; label: string; value: number | string;
  sub?: string; color?: string;
}) {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-white/5">
            <Icon className="w-5 h-5 text-slate-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: instanceData, refetch: refetchInstances } = useQuery<{
    summary: InstanceSummary; instances: InstanceStat[];
  }>({ queryKey: ["/api/instances"], refetchInterval: autoRefresh ? 3000 : false });

  const { data: clusterData, refetch: refetchClusters } = useQuery<ClusterReport>({
    queryKey: ["/api/clusters"], refetchInterval: autoRefresh ? 5000 : false,
  });

  const { data: metricsData, refetch: refetchMetrics } = useQuery<Metrics>({
    queryKey: ["/api/metrics"], refetchInterval: autoRefresh ? 3000 : false,
  });

  const { data: physicsPresets } = useQuery<Record<string, PhysicsPreset>>({
    queryKey: ["/api/physics-presets"],
  });

  // ── Terminate mutation ────────────────────────────────────────────────────────
  const terminateMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      apiRequest("DELETE", `/api/instances/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clusters"] });
    },
  });

  // ── Manual refresh ────────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    refetchInstances(); refetchClusters(); refetchMetrics();
    setLastRefreshed(Date.now());
  }, [refetchInstances, refetchClusters, refetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => setLastRefreshed(Date.now()), 3000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const summary   = instanceData?.summary;
  const instances = instanceData?.instances ?? [];
  const clusters  = clusterData?.clusters ?? [];

  // uptime from metrics
  const serverUptime = metricsData ? fmtUptime(metricsData.uptimeMs) : "—";
  const counters = metricsData?.counters ?? {};

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0f1117]/95 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <Link href="/home">
            <Button variant="ghost" size="sm" className="gap-1.5 text-slate-400 hover:text-white h-8 px-2">
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-sm">Runtime Admin</span>
          </div>
          <span className="text-xs text-slate-500">Server uptime: {serverUptime}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Updated {Math.round((Date.now() - lastRefreshed) / 1000)}s ago
          </span>
          <Button
            variant="ghost" size="sm"
            className={`gap-1.5 h-8 text-xs ${autoRefresh ? "text-green-400" : "text-slate-400"}`}
            onClick={() => setAutoRefresh(v => !v)}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-400" onClick={refresh}>
            Refresh now
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Summary cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard icon={Activity}  label="Active"          value={summary?.active ?? 0}        color="text-green-400" />
          <SummaryCard icon={Clock}     label="Idle"            value={summary?.idle ?? 0}          color="text-yellow-400" />
          <SummaryCard icon={Moon}      label="Sleeping"        value={summary?.sleeping ?? 0}      color="text-blue-400" />
          <SummaryCard icon={Server}    label="Total Instances" value={summary?.total ?? 0} />
          <SummaryCard icon={Users}     label="Online Players"  value={summary?.totalPlayers ?? 0}  color="text-purple-400" />
          <SummaryCard
            icon={Zap}
            label="Players Joined"
            value={counters["players.joined"] ?? 0}
            sub={`${counters["players.left"] ?? 0} left`}
          />
        </div>

        {/* ── Instances table ────────────────────────────────────────────────── */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              Live Instances
              <span className="ml-auto text-xs text-slate-500 font-normal">
                {instances.length} session{instances.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {instances.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-500 text-sm">
                No active instances — start a game to see data here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-slate-500">
                      <th className="px-5 py-2 font-medium">Session</th>
                      <th className="px-3 py-2 font-medium">Game</th>
                      <th className="px-3 py-2 font-medium">State</th>
                      <th className="px-3 py-2 font-medium">Players</th>
                      <th className="px-3 py-2 font-medium">Tick Hz</th>
                      <th className="px-3 py-2 font-medium">Uptime</th>
                      <th className="px-3 py-2 font-medium">Wakes</th>
                      <th className="px-3 py-2 font-medium">Total Joins</th>
                      <th className="px-3 py-2 font-medium w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {instances.map((inst) => (
                      <tr key={inst.sessionId} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-5 py-2.5 font-mono text-xs text-slate-400 truncate max-w-[10rem]">
                          {inst.sessionId.slice(0, 12)}…
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-400 truncate max-w-[8rem]">
                          {inst.gameId?.slice(0, 8) || "—"}
                        </td>
                        <td className="px-3 py-2.5"><StateBadge state={inst.state} /></td>
                        <td className="px-3 py-2.5 tabular-nums">{inst.playerCount}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-300">{inst.tickRateHz} Hz</td>
                        <td className="px-3 py-2.5 text-slate-400 tabular-nums">{fmtUptime(inst.uptimeMs)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-400">{inst.wakeCount}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-400">{inst.totalPlayerJoins}</td>
                        <td className="px-3 py-2.5">
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 w-6 p-0 text-red-500/60 hover:text-red-400 hover:bg-red-500/10"
                            onClick={() => terminateMutation.mutate(inst.sessionId)}
                            disabled={terminateMutation.isPending}
                            title="Force-terminate instance"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Clusters + Metrics row ─────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4">

          {/* Clusters */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                Cluster Load
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clusters.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">No clusters active yet.</p>
              ) : (
                <div className="space-y-3">
                  {clusters.map((c) => (
                    <div key={c.id} className="p-3 rounded-lg bg-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TierBadge tier={c.tier} />
                          <span className="font-mono text-xs text-slate-400">{c.id}</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {c.instanceCount} inst · {c.totalPlayers} players
                        </span>
                      </div>
                      <UtilBar pct={c.utilizationPct} />
                    </div>
                  ))}
                </div>
              )}

              {clusterData && clusterData.predictiveWarmList.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-400" /> Predictive warm list
                    <span className="text-slate-600">(games likely to spike soon)</span>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {clusterData.predictiveWarmList.map(id => (
                      <span key={id} className="font-mono text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded">
                        {id.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metrics */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400" />
                Server Counters
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(counters).length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">
                  No events recorded yet — counters populate as players join.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(counters).map(([key, val]) => (
                    <div key={key} className="p-3 rounded-lg bg-white/5">
                      <p className="text-xs text-slate-500 truncate">{key}</p>
                      <p className="text-xl font-bold tabular-nums text-white mt-0.5">{val.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Physics presets reference ───────────────────────────────────────── */}
        {physicsPresets && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Physics Presets
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-slate-500">
                      <th className="px-5 py-2 font-medium">Preset</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Gravity</th>
                      <th className="px-3 py-2 font-medium">Air Drag</th>
                      <th className="px-3 py-2 font-medium">Tick Rate</th>
                      <th className="px-3 py-2 font-medium">Interest R.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(physicsPresets).map(([key, p]) => (
                      <tr key={key} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-5 py-2.5 font-medium">{p.name}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs">{p.description}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-300">{p.gravity}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-300">{p.airDrag}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-300">{p.tickRateHz} Hz</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-300">{p.interestRadius} u</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Architecture notes ─────────────────────────────────────────────── */}
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-300 flex items-center gap-2">
              <Server className="w-4 h-4" />
              Runtime Architecture Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
            <p>
              <span className="text-white font-medium">InstanceManager</span> — owns every GameRoom. Lifecycle: active → idle (10 s empty) → sleeping (40 s) → terminated (5 min). Tick-rate auto-scales: 1 Hz idle · 15 Hz 1-2 players · 20 Hz 3-10 · 30 Hz 11-30 · 60 Hz 31+.
            </p>
            <p>
              <span className="text-white font-medium">ClusterManager</span> — groups instances into tiers (small / medium / large) and records hourly activity for predictive warm-up.
            </p>
            <p>
              <span className="text-white font-medium">Interest-based simulation</span> — dynamic objects beyond 60 units of every player are frozen (physics skipped), saving CPU on large worlds.
            </p>
            <p>
              <span className="text-white font-medium">SharedServices</span> — Matchmaking queue, platform chat (pub-sub), avatar/inventory store, physics presets, server metrics.
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
