import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Gamepad2, Trophy, Package, Users,
  MoreHorizontal, Settings, Flag, UserPlus, MessageSquare, Share2,
  Play, Star, Calendar
} from "lucide-react";
import AvatarPortrait from "@/components/AvatarPortrait";
import { getAvatarConfig } from "@/lib/avatarConfig";
import type { Game } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

type Tab = "games" | "badges" | "inventory";

const BADGE_PLACEHOLDERS = [
  { id: "1", name: "First Steps",   icon: "🎮", desc: "Played your first game",          earned: true  },
  { id: "2", name: "Builder",       icon: "🔨", desc: "Created your first experience",   earned: true  },
  { id: "3", name: "Socialite",     icon: "👥", desc: "Made 5 friends",                  earned: false },
  { id: "4", name: "Adventurer",    icon: "⚔️",  desc: "Played 10 different games",      earned: false },
  { id: "5", name: "Scripter",      icon: "💻", desc: "Used scripting in a game",        earned: false },
  { id: "6", name: "Veteran",       icon: "🏆", desc: "Logged in 30 days in a row",      earned: false },
];

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const [tab, setTab] = useState<Tab>("games");
  const [menuOpen, setMenuOpen] = useState(false);
  const { user: currentUser } = useAuth();

  const avatarCfg = getAvatarConfig();
  const isOwnProfile = !userId || userId === currentUser?.id;

  const { data: profileUser } = useQuery<any>({
    queryKey: [`/api/auth/user`],
    enabled: true,
  });

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    select: (all) => all.filter((g) => g.isPublished),
  });

  const displayName = profileUser?.firstName && profileUser?.lastName
    ? `${profileUser.firstName} ${profileUser.lastName}`
    : profileUser?.firstName || profileUser?.email?.split("@")[0] || "Player";

  const joinDate = profileUser?.createdAt
    ? new Date(profileUser.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Unknown";

  const earnedBadges = BADGE_PLACEHOLDERS.filter((b) => b.earned).length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "games",     label: "Games",     icon: <Gamepad2   className="w-4 h-4" />, count: games.length },
    { id: "badges",    label: "Badges",    icon: <Trophy     className="w-4 h-4" />, count: earnedBadges },
    { id: "inventory", label: "Inventory", icon: <Package    className="w-4 h-4" />, count: 0 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/home">
            <button className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">Rebur Engine</span>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-8 h-8 rounded-lg bg-white/8 hover:bg-white/15 transition-colors flex items-center justify-center"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 w-44 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                {[
                  { icon: <Share2    className="w-3.5 h-3.5" />, label: "Share Profile" },
                  { icon: <Flag      className="w-3.5 h-3.5" />, label: "Report",      danger: true },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setMenuOpen(false)}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-white/8 transition-colors ${item.danger ? "text-red-400" : "text-white/80"}`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero section ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Backdrop banner */}
        <div className="h-28 bg-gradient-to-br from-blue-900/50 via-purple-900/30 to-[#0a0a0a]" />

        <div className="px-5 pb-5">
          {/* Avatar overlapping banner */}
          <div className="relative -mt-14 flex items-end gap-4">
            <div className="w-[100px] h-[100px] rounded-2xl overflow-hidden border-[3px] border-[#0a0a0a] shadow-xl shrink-0 bg-[#111]">
              <AvatarPortrait
                skinColor={avatarCfg.skinColor}
                shirtColor={avatarCfg.shirtColor}
                pantsColor={avatarCfg.pantsColor}
                size={100}
              />
            </div>
            <div className="pb-1 flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{displayName}</h1>
              <p className="text-sm text-white/40 truncate">@{displayName.toLowerCase().replace(/\s+/g, "_")}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex gap-2">
            {isOwnProfile ? (
              <Link href="/avatar" className="flex-1">
                <button className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-white/10 hover:bg-white/15 border border-white/12 text-sm font-medium transition-colors">
                  <Settings className="w-3.5 h-3.5" />
                  Edit Avatar
                </button>
              </Link>
            ) : (
              <>
                <button className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">
                  <UserPlus className="w-3.5 h-3.5" />
                  Follow
                </button>
                <button className="flex items-center justify-center gap-2 px-4 h-9 rounded-lg bg-white/10 hover:bg-white/15 border border-white/12 text-sm transition-colors">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </button>
              </>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/8 bg-white/4 rounded-xl overflow-hidden border border-white/8">
            {[
              { label: "Friends",    value: "0",              icon: <Users    className="w-4 h-4 text-blue-400" /> },
              { label: "Games",      value: String(games.length), icon: <Gamepad2 className="w-4 h-4 text-purple-400" /> },
              { label: "Badges",     value: String(earnedBadges), icon: <Trophy   className="w-4 h-4 text-yellow-400" /> },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center py-3 px-2 gap-1">
                {s.icon}
                <span className="text-lg font-bold leading-none">{s.value}</span>
                <span className="text-[11px] text-white/40">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Join date */}
          <div className="mt-4 flex items-center gap-2 text-xs text-white/35">
            <Calendar className="w-3.5 h-3.5" />
            <span>Joined {joinDate}</span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div className="sticky top-14 z-40 px-5 pb-0 border-b border-white/8 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-blue-500 text-white"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {t.icon}
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === t.id ? "bg-blue-600 text-white" : "bg-white/10 text-white/50"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────── */}
      <main className="px-4 py-5">

        {/* GAMES */}
        {tab === "games" && (
          <div>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-xl bg-white/5 animate-pulse aspect-[4/3]" />
                ))}
              </div>
            ) : games.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {games.map((game) => (
                  <Link key={game.id} href={`/play/${game.id}`}>
                    <div className="rounded-xl overflow-hidden bg-[#111] border border-white/8 hover:border-white/20 transition-all hover:scale-[1.02] group cursor-pointer">
                      <div className="aspect-[4/3] bg-gradient-to-br from-blue-900/30 to-purple-900/20 flex items-center justify-center relative">
                        {game.thumbnail ? (
                          <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover" />
                        ) : (
                          <Gamepad2 className="w-10 h-10 text-white/20" />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                        </div>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold truncate">{game.title}</p>
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-white/35">
                          <Play className="w-3 h-3" />
                          <span>{game.plays ?? 0} plays</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Gamepad2 className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/40 text-sm">No published games yet</p>
                {isOwnProfile && (
                  <Link href="/home">
                    <Button size="sm" variant="outline" className="mt-1">Create a Game</Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* BADGES */}
        {tab === "badges" && (
          <div className="grid grid-cols-2 gap-3">
            {BADGE_PLACEHOLDERS.map((badge) => (
              <div
                key={badge.id}
                className={`rounded-xl p-4 border flex flex-col items-center gap-2 text-center transition-all ${
                  badge.earned
                    ? "bg-yellow-900/20 border-yellow-500/30"
                    : "bg-white/3 border-white/8 opacity-50"
                }`}
              >
                <span className="text-3xl">{badge.icon}</span>
                <div>
                  <p className={`text-sm font-semibold ${badge.earned ? "text-yellow-300" : "text-white/50"}`}>
                    {badge.name}
                  </p>
                  <p className="text-[11px] text-white/35 mt-0.5 leading-tight">{badge.desc}</p>
                </div>
                {badge.earned && (
                  <div className="flex items-center gap-1 text-[10px] text-yellow-400/80">
                    <Star className="w-3 h-3 fill-current" />
                    Earned
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* INVENTORY */}
        {tab === "inventory" && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <Package className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/40 text-sm">Inventory is empty</p>
            <p className="text-white/25 text-xs max-w-[200px]">Assets and items you collect will appear here</p>
          </div>
        )}
      </main>
    </div>
  );
}
